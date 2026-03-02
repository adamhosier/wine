import type { RuntimeData } from "./data";
import { GRAPE_CHARACTERISTIC_QUESTIONS } from "../data/grape-characteristics-questions";

type GrapeEntry = { grape: string; pct: number };
type QuestionCategory = "parent" | "child" | "map-region" | "grape-profile" | "grape-characteristic";

export type QuizQuestion = {
  id: string;
  difficulty: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  meta?: string;
  kind?: "text" | "map-region";
  highlightNodeId?: string;
};

type NodeMeta = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  grapes: GrapeEntry[];
};

type CandidateQuestion = QuizQuestion & {
  category: QuestionCategory;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function pickDistinct<T>(source: T[], count: number, rand: () => number): T[] {
  const copy = [...source];
  shuffleInPlace(copy, rand);
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

function parseGrapes(raw: unknown): GrapeEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const obj = entry as Record<string, unknown>;
      const grape = typeof obj.grape === "string" ? obj.grape : "";
      const pct = typeof obj.pct === "number" ? obj.pct : 0;
      if (!grape) {
        return null;
      }
      return { grape, pct };
    })
    .filter((value): value is GrapeEntry => Boolean(value));
}

function hasGrape(node: NodeMeta, grape: string): boolean {
  return node.grapes.some((entry) => entry.grape === grape);
}

function nodeMetaFromData(data: RuntimeData): NodeMeta[] {
  const byId = new Map<string, NodeMeta>();
  const features = [...data.regions.features, ...data.hierarchyNodes.features];
  for (const feature of features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const id = typeof props.node_id === "string" ? props.node_id : "";
    if (!id) {
      continue;
    }
    const fromName = typeof props.name === "string" ? props.name : "";
    const slug = typeof props.slug === "string" ? props.slug : id.replace(/^[^:]+:/, "");
    const grapes = parseGrapes(props.leaf_grape_breakdown);
    const existing = byId.get(id);
    if (existing) {
      if (!existing.name && fromName) {
        existing.name = fromName;
      }
      if (!existing.grapes.length && grapes.length) {
        existing.grapes = grapes;
      }
      continue;
    }
    const treeNode = data.treeNodes.find((node) => node.id === id);
    byId.set(id, {
      id,
      name: fromName || slug,
      slug,
      parentId: treeNode?.parentId ?? null,
      depth: treeNode?.depth ?? 0,
      grapes,
    });
  }
  return data.treeNodes
    .map((node) => {
      const meta = byId.get(node.id);
      return (
        meta ?? {
          id: node.id,
          name: node.slug,
          slug: node.slug,
          parentId: node.parentId,
          depth: node.depth,
          grapes: [],
        }
      );
    })
    .filter((node) => node.name);
}

function pushUnique(
  bucket: CandidateQuestion[],
  seen: Set<string>,
  key: string,
  create: () => CandidateQuestion | null,
): void {
  if (seen.has(key)) {
    return;
  }
  const question = create();
  if (!question) {
    return;
  }
  const correctValue = question.options[question.correctIndex];
  const uniqueOptions = [...new Set(question.options)];
  if (uniqueOptions.length < 2) {
    return;
  }
  const correctedIndex = uniqueOptions.indexOf(correctValue);
  if (correctedIndex < 0) {
    return;
  }
  question.options = uniqueOptions;
  question.correctIndex = correctedIndex;
  seen.add(key);
  bucket.push(question);
}

export function generateQuizQuestions(
  data: RuntimeData,
  count = 20,
  options?: { allowRepeats?: boolean; seed?: number },
): QuizQuestion[] {
  const seed = options?.seed ?? hashString(data.sourceId);
  const rand = mulberry32(seed);
  const nodes = nodeMetaFromData(data);
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const rootIdByNodeId = new Map<string, string>();
  const resolveRootId = (nodeId: string): string => {
    const cached = rootIdByNodeId.get(nodeId);
    if (cached) {
      return cached;
    }
    let current = byId.get(nodeId);
    while (current?.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) {
        break;
      }
      current = parent;
    }
    const rootId = current?.id ?? nodeId;
    rootIdByNodeId.set(nodeId, rootId);
    return rootId;
  };
  const childrenByParent = new Map<string, NodeMeta[]>();
  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }
    const bucket = childrenByParent.get(node.parentId);
    if (bucket) {
      bucket.push(node);
    } else {
      childrenByParent.set(node.parentId, [node]);
    }
  }

  const allNames = nodes.map((node) => node.name);
  const grapeSet = new Set<string>();
  for (const node of nodes) {
    for (const grape of node.grapes) {
      grapeSet.add(grape.grape);
    }
  }
  const allGrapes = [...grapeSet];
  const availableGrapes = new Set(allGrapes.map((grape) => grape.toLowerCase()));
  const grapesByRoot = new Map<string, string[]>();
  for (const node of nodes) {
    const rootId = resolveRootId(node.id);
    const bucket = grapesByRoot.get(rootId) ?? [];
    for (const grape of node.grapes) {
      if (!bucket.includes(grape.grape)) {
        bucket.push(grape.grape);
      }
    }
    grapesByRoot.set(rootId, bucket);
  }

  const contextualNodePool = (node: NodeMeta, predicate?: (entry: NodeMeta) => boolean): NodeMeta[] => {
    const matches = (entry: NodeMeta): boolean =>
      entry.id !== node.id && (predicate ? predicate(entry) : true);
    const sameRootSameDepth = nodes.filter(
      (entry) => matches(entry) && entry.depth === node.depth && resolveRootId(entry.id) === resolveRootId(node.id),
    );
    if (sameRootSameDepth.length >= 3) {
      return sameRootSameDepth;
    }
    const sameDepth = nodes.filter((entry) => matches(entry) && entry.depth === node.depth);
    if (sameDepth.length >= 3) {
      return sameDepth;
    }
    return nodes.filter(matches);
  };

  const contextualNamePool = (node: NodeMeta): string[] => {
    const pool = contextualNodePool(node);
    if (pool.length) {
      return pool.map((entry) => entry.name);
    }
    return allNames.filter((name) => name !== node.name);
  };

  const candidates: CandidateQuestion[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (!parent) {
      continue;
    }
    const parentDistractorPool = nodes
      .filter(
        (entry) =>
          entry.id !== parent.id &&
          entry.depth === parent.depth &&
          resolveRootId(entry.id) === resolveRootId(parent.id),
      )
      .map((entry) => entry.name);
    const distractors = pickDistinct(
      parentDistractorPool.length >= 3
        ? parentDistractorPool
        : nodes.filter((entry) => entry.id !== parent.id && entry.depth === parent.depth).map((entry) => entry.name),
      3,
      rand,
    );
    const options = [parent.name, ...distractors];
    shuffleInPlace(options, rand);
    const correctIndex = options.indexOf(parent.name);
    pushUnique(candidates, seen, `parent:${node.id}`, () => ({
      id: `parent:${node.id}`,
      difficulty: Math.min(2 + node.depth, 4),
      prompt: `${node.name} belongs to which parent region?`,
      options,
      correctIndex,
      category: "parent",
    }));
  }

  for (const [parentId, children] of childrenByParent) {
    const parent = byId.get(parentId);
    if (!parent || !children.length) {
      continue;
    }
    for (const child of children) {
      const sameDepthPool = nodes.filter(
        (node) =>
          node.depth === child.depth &&
          node.id !== child.id &&
          resolveRootId(node.id) === resolveRootId(child.id) &&
          node.parentId !== parentId,
      );
      const globalPool = nodes.filter(
        (node) => node.depth === child.depth && node.id !== child.id && node.parentId !== parentId,
      );
      const distractors = pickDistinct(
        (sameDepthPool.length >= 3 ? sameDepthPool : globalPool.length ? globalPool : nodes
          .filter((node) => node.depth === child.depth && node.id !== child.id)
        ).map((node) => node.name),
        3,
        rand,
      );
      const options = [child.name, ...distractors];
      shuffleInPlace(options, rand);
      const correctIndex = options.indexOf(child.name);
      pushUnique(candidates, seen, `child:${parentId}:${child.id}`, () => ({
        id: `child:${parentId}:${child.id}`,
        difficulty: Math.min(1 + child.depth, 4),
        prompt: `Which of these regions is in ${parent.name}?`,
        options,
        correctIndex,
        category: "child",
      }));
    }
  }

  for (const node of nodes.filter((entry) => entry.depth >= 1)) {
    const distractorPool = contextualNamePool(node);
    const distractors = pickDistinct(distractorPool, 3, rand);
    const options = [node.name, ...distractors];
    shuffleInPlace(options, rand);
    pushUnique(candidates, seen, `map-region:${node.id}`, () => ({
      id: `map-region:${node.id}`,
      difficulty: Math.min(1 + node.depth, 4),
      prompt: "Which region is highlighted on the map?",
      options,
      correctIndex: options.indexOf(node.name),
      kind: "map-region",
      highlightNodeId: node.id,
      category: "map-region",
    }));
  }

  for (const node of nodes.filter((entry) => entry.grapes.length > 0)) {
    const sorted = [...node.grapes].sort((a, b) => b.pct - a.pct);
    const top = sorted[0];
    if (!top) {
      continue;
    }
    const rootGrapes = grapesByRoot.get(resolveRootId(node.id)) ?? [];
    const distractorGrapes = pickDistinct(
      (rootGrapes.filter((grape) => grape !== top.grape).length >= 3
        ? rootGrapes.filter((grape) => grape !== top.grape)
        : allGrapes.filter((grape) => grape !== top.grape)),
      3,
      rand,
    );
    const options = [top.grape, ...distractorGrapes];
    shuffleInPlace(options, rand);
    pushUnique(candidates, seen, `grape-top:${node.id}`, () => ({
      id: `grape-top:${node.id}`,
      difficulty: 3,
      prompt: `What is the most common grape variety in ${node.name}?`,
      options,
      correctIndex: options.indexOf(top.grape),
      meta: `${top.grape} ${top.pct}%`,
      category: "grape-profile",
    }));
  }

  for (const node of nodes.filter((entry) => entry.grapes.length >= 1 && entry.grapes.length <= 3)) {
    const sorted = [...node.grapes].sort((a, b) => b.pct - a.pct);
    const top = sorted[0];
    if (!top) {
      continue;
    }

    let prompt = "";
    let difficulty = 3;
    let key = "";
    let distractorPredicate: (entry: NodeMeta) => boolean = () => true;

    if (sorted.length === 1) {
      prompt = `Which of these regions grows 100% ${top.grape}?`;
      difficulty = 3;
      key = `grape-region:single:${node.id}`;
      distractorPredicate = (entry) => !hasGrape(entry, top.grape);
    } else if (sorted.length === 2) {
      const blendLabel = `${sorted[0].grape} and ${sorted[1].grape}`;
      prompt = `Which of these regions is known for a blend of ${blendLabel}?`;
      difficulty = 4;
      key = `grape-region:blend:${node.id}`;
      distractorPredicate = (entry) => !(hasGrape(entry, sorted[0].grape) && hasGrape(entry, sorted[1].grape));
    } else {
      prompt = `Which of these regions is known for ${top.grape}?`;
      difficulty = 4;
      key = `grape-region:known:${node.id}`;
      distractorPredicate = (entry) => !hasGrape(entry, top.grape);
    }

    const distractors = pickDistinct(
      contextualNodePool(node, distractorPredicate).map((entry) => entry.name),
      3,
      rand,
    );
    const regionOptions = [node.name, ...distractors];
    shuffleInPlace(regionOptions, rand);
    pushUnique(candidates, seen, key, () => ({
      id: key,
      difficulty,
      prompt,
      options: regionOptions,
      correctIndex: regionOptions.indexOf(node.name),
      meta: sorted.map((entry) => `${entry.grape} ${entry.pct}%`).join(", "),
      category: "grape-profile",
    }));
  }

  for (const question of GRAPE_CHARACTERISTIC_QUESTIONS) {
    if (!question.requiredGrapes.every((grape) => availableGrapes.has(grape.toLowerCase()))) {
      continue;
    }
    pushUnique(candidates, seen, question.id, () => ({
      id: question.id,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: [...question.options],
      correctIndex: question.correctIndex,
      category: "grape-characteristic",
    }));
  }

  const available = [...candidates];
  shuffleInPlace(available, rand);
  const ordered: CandidateQuestion[] = [];
  const target = Math.max(1, count);
  const categoryCounts = new Map<QuestionCategory, number>();
  const pickNextByTargetDifficulty = (targetDifficulty: number): CandidateQuestion | null => {
    if (!available.length) {
      return null;
    }
    const lastCategory = ordered[ordered.length - 1]?.category ?? null;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < available.length; i += 1) {
      const question = available[i];
      const difficultyPenalty = Math.abs(question.difficulty - targetDifficulty);
      const categoryPenalty = (categoryCounts.get(question.category) ?? 0) * 0.35;
      const repeatPenalty = question.category === lastCategory ? 0.2 : 0;
      const score = difficultyPenalty + categoryPenalty + repeatPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      return null;
    }
    const [picked] = available.splice(bestIndex, 1);
    return picked ?? null;
  };

  for (let i = 0; i < target; i += 1) {
    const ratio = target <= 1 ? 1 : i / (target - 1);
    const desiredDifficulty = 1 + Math.pow(ratio, 0.62) * 3;
    let question = pickNextByTargetDifficulty(desiredDifficulty);
    if (!question) {
      break;
    }
    ordered.push(question);
    categoryCounts.set(question.category, (categoryCounts.get(question.category) ?? 0) + 1);
  }

  if ((options?.allowRepeats ?? true) && ordered.length < target && candidates.length) {
    const fallback = [...candidates];
    shuffleInPlace(fallback, rand);
    let idx = 0;
    while (ordered.length < target) {
      const source = fallback[idx % fallback.length];
      ordered.push({
        ...source,
        id: `${source.id}::repeat-${idx}`,
      });
      idx += 1;
    }
  }

  return ordered.slice(0, target).map(({ category: _category, ...question }) => question);
}

export function countUniqueQuizQuestions(data: RuntimeData): number {
  return generateQuizQuestions(data, Number.MAX_SAFE_INTEGER, { allowRepeats: false }).length;
}
