import { useEffect, useMemo, useState } from "react";
import {
  loadRuntimeData,
  RUNTIME_DATA_SOURCES,
  type RuntimeData,
  type RuntimeDataSourceId,
} from "./lib/data";
import { generateQuizQuestions } from "./lib/quiz";
import QuizRegionMap from "./QuizRegionMap";
import { buildAppPath } from "./lib/appRoute";

const QUESTION_COUNT = 20;

type QuizPhase = "setup" | "running" | "finished";
const nextQuizSeed = () => Math.floor(Math.random() * 0x7fffffff);

export default function QuizPage() {
  const mapPath = buildAppPath(import.meta.env.BASE_URL);
  const [sourceId, setSourceId] = useState<RuntimeDataSourceId>("wset-level-2");
  const [runtimeData, setRuntimeData] = useState<RuntimeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<QuizPhase>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [quizSeed, setQuizSeed] = useState<number>(() => nextQuizSeed());

  useEffect(() => {
    let cancelled = false;
    setRuntimeData(null);
    setError(null);
    setPhase("setup");
    setCurrentIndex(0);
    setAnswers([]);
    setQuizSeed(nextQuizSeed());

    loadRuntimeData(sourceId)
      .then((data) => {
        if (!cancelled) {
          setRuntimeData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const questions = useMemo(
    () => (runtimeData ? generateQuizQuestions(runtimeData, QUESTION_COUNT, { seed: quizSeed }) : []),
    [runtimeData, quizSeed],
  );
  const questionGeometryByNodeId = useMemo(() => {
    if (!runtimeData) {
      return new Map<string, GeoJSON.Polygon | GeoJSON.MultiPolygon>();
    }
    const map = new Map<string, GeoJSON.Polygon | GeoJSON.MultiPolygon>();
    for (const feature of runtimeData.regions.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const nodeId = typeof props.node_id === "string" ? props.node_id : "";
      if (nodeId) {
        map.set(nodeId, feature.geometry);
      }
    }
    for (const feature of runtimeData.hierarchyNodes.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const nodeId = typeof props.node_id === "string" ? props.node_id : "";
      if (nodeId) {
        map.set(nodeId, feature.geometry);
      }
    }
    return map;
  }, [runtimeData]);
  const questionBoundsByNodeId = useMemo(() => {
    const map = new Map<string, [[number, number], [number, number]]>();
    for (const node of runtimeData?.treeNodes ?? []) {
      map.set(node.id, node.bounds);
    }
    return map;
  }, [runtimeData?.treeNodes]);

  const currentQuestion = questions[currentIndex] ?? null;
  const selectedAnswer = answers[currentIndex] ?? null;
  const answeredCount = answers.filter((value) => typeof value === "number").length;
  const correctCount = questions.reduce((acc, question, index) => {
    return answers[index] === question.correctIndex ? acc + 1 : acc;
  }, 0);
  const progressRatio = questions.length ? Math.min(1, currentIndex / questions.length) : 0;
  const progressPct = Math.round(progressRatio * 100);

  const onStart = () => {
    setQuizSeed(nextQuizSeed());
    setPhase("running");
    setCurrentIndex(0);
    setAnswers([]);
  };

  const onSelectAnswer = (optionIndex: number) => {
    if (phase !== "running") {
      return;
    }
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = optionIndex;
      return next;
    });
  };

  const onNext = () => {
    if (phase !== "running") {
      return;
    }
    if (currentIndex + 1 >= questions.length) {
      setPhase("finished");
      return;
    }
    setCurrentIndex((value) => value + 1);
  };

  const onRestart = () => {
    setQuizSeed(nextQuizSeed());
    setPhase("setup");
    setCurrentIndex(0);
    setAnswers([]);
  };

  return (
    <div className="quiz-shell">
      <div className="quiz-card">
        <div className="quiz-header">
          <div className="quiz-title-wrap">
            <div className="quiz-kicker">Blind Tasting Trainer</div>
            <h1>Wine Regions Quiz</h1>
            <p className="quiz-subtitle">Test region recognition, hierarchy recall, grape composition, and classic varietal aromas.</p>
          </div>
          <a className="quiz-back-link" href={mapPath}>
            Back to Map
          </a>
        </div>

        <div className="quiz-toolbar">
          <div className="quiz-source-control">
            <label htmlFor="quiz-source">Dataset</label>
            <select
              id="quiz-source"
              className="source-select"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value as RuntimeDataSourceId)}
            >
              {RUNTIME_DATA_SOURCES.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </div>
          {runtimeData && phase === "running" ? (
            <div className="quiz-meta">
              <span>{`Question ${currentIndex + 1}/${questions.length}`}</span>
              <span>{`Score ${correctCount}/${answeredCount}`}</span>
            </div>
          ) : null}
        </div>
        {runtimeData && phase === "running" ? (
          <div className="quiz-progress">
            <div className="quiz-progress-label">{`Progress ${progressPct}%`}</div>
            <div className="quiz-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}>
              <div className="quiz-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        ) : null}

        {error ? <div className="quiz-error">Failed to load dataset: {error}</div> : null}
        {!runtimeData && !error ? <div className="quiz-status">Loading dataset...</div> : null}

        {runtimeData && phase === "setup" ? (
          <div className="quiz-panel quiz-setup">
            <p className="quiz-setup-title">{runtimeData.sourceLabel}</p>
            <p>{`You will be asked 20 randomized multiple-choice questions covering regions, grapes, and classic aroma cues.`}</p>
            <button className="quiz-primary-btn" type="button" onClick={onStart}>
              Start Quiz
            </button>
          </div>
        ) : null}

        {runtimeData && phase === "running" && currentQuestion ? (
          <div className="quiz-panel quiz-running">
            <div className="quiz-prompt">{currentQuestion.prompt}</div>
            {currentQuestion.kind === "map-region" &&
            currentQuestion.highlightNodeId &&
            questionGeometryByNodeId.has(currentQuestion.highlightNodeId) &&
            questionBoundsByNodeId.has(currentQuestion.highlightNodeId) ? (
              <QuizRegionMap
                geometry={questionGeometryByNodeId.get(currentQuestion.highlightNodeId)!}
                bounds={questionBoundsByNodeId.get(currentQuestion.highlightNodeId)!}
              />
            ) : null}
            <div className="quiz-options">
              {currentQuestion.options.map((option, optionIndex) => {
                const selected = selectedAnswer === optionIndex;
                const isCorrect = currentQuestion.correctIndex === optionIndex;
                const reveal = selectedAnswer != null;
                return (
                  <button
                    key={`${currentQuestion.id}:${option}`}
                    type="button"
                    className={`quiz-option${selected ? " is-selected" : ""}${reveal && isCorrect ? " is-correct" : ""}${reveal && selected && !isCorrect ? " is-wrong" : ""}`}
                    onClick={() => onSelectAnswer(optionIndex)}
                    disabled={selectedAnswer != null}
                  >
                    <span className="quiz-option-label">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {selectedAnswer != null ? (
              <div className="quiz-footer">
                <span className={selectedAnswer === currentQuestion.correctIndex ? "quiz-feedback ok" : "quiz-feedback bad"}>
                  {selectedAnswer === currentQuestion.correctIndex
                    ? "Correct."
                    : `Incorrect. Correct answer: ${currentQuestion.options[currentQuestion.correctIndex]}.`}
                </span>
                <button className="quiz-primary-btn" type="button" onClick={onNext}>
                  {currentIndex + 1 >= questions.length ? "Finish" : "Next"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {runtimeData && phase === "finished" ? (
          <div className="quiz-panel quiz-finished">
            <p className="quiz-finished-title">Quiz Complete</p>
            <p>{`Final score: ${correctCount}/${questions.length}`}</p>
            <p>{`Accuracy: ${Math.round((correctCount / Math.max(1, questions.length)) * 100)}%`}</p>
            <div className="quiz-actions">
              <button className="quiz-primary-btn" type="button" onClick={onRestart}>
                New Quiz
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
