import type { RuntimeData } from "./data";

type GrapeEntry = { grape: string; pct: number };

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
  bucket: QuizQuestion[],
  seen: Set<string>,
  key: string,
  create: () => QuizQuestion | null,
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

  const contextualNamePool = (node: NodeMeta): string[] => {
    const sameRootSameDepth = nodes
      .filter(
        (entry) =>
          entry.id !== node.id && entry.depth === node.depth && resolveRootId(entry.id) === resolveRootId(node.id),
      )
      .map((entry) => entry.name);
    if (sameRootSameDepth.length >= 3) {
      return sameRootSameDepth;
    }
    const sameDepth = nodes.filter((entry) => entry.id !== node.id && entry.depth === node.depth).map((entry) => entry.name);
    if (sameDepth.length >= 3) {
      return sameDepth;
    }
    return allNames.filter((name) => name !== node.name);
  };

  const candidates: QuizQuestion[] = [];
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
    }));

    const pctOptions = new Set<number>([top.pct]);
    while (pctOptions.size < 4) {
      const delta = Math.floor(rand() * 5 + 1) * 5;
      const sign = rand() > 0.5 ? 1 : -1;
      const candidate = Math.max(5, Math.min(95, top.pct + sign * delta));
      pctOptions.add(candidate);
      if (pctOptions.size > 8) {
        break;
      }
    }
    const pctList = [...pctOptions].slice(0, 4);
    const pctLabels = pctList.map((value) => `${value}%`);
    shuffleInPlace(pctLabels, rand);
    pushUnique(candidates, seen, `grape-pct:${node.id}`, () => ({
      id: `grape-pct:${node.id}`,
      difficulty: 4,
      prompt: `In ${node.name}, about what share is ${top.grape}?`,
      options: pctLabels,
      correctIndex: pctLabels.indexOf(`${top.pct}%`),
      meta: `${top.grape} ${top.pct}%`,
    }));
  }

  const byDifficulty = new Map<number, QuizQuestion[]>();
  for (const candidate of candidates) {
    const bucket = byDifficulty.get(candidate.difficulty);
    if (bucket) {
      bucket.push(candidate);
    } else {
      byDifficulty.set(candidate.difficulty, [candidate]);
    }
  }
  for (const bucket of byDifficulty.values()) {
    shuffleInPlace(bucket, rand);
  }

  const ordered: QuizQuestion[] = [];
  const target = Math.max(1, count);
  const pickNextByTargetDifficulty = (targetDifficulty: number): QuizQuestion | null => {
    const available: Array<{ diff: number; question: QuizQuestion; bucket: QuizQuestion[] }> = [];
    for (const bucket of byDifficulty.values()) {
      if (!bucket.length) {
        continue;
      }
      const question = bucket[0];
      available.push({
        diff: Math.abs(question.difficulty - targetDifficulty),
        question,
        bucket,
      });
    }
    if (!available.length) {
      return null;
    }
    available.sort((a, b) => a.diff - b.diff);
    const best = available[0];
    return best.bucket.shift() ?? null;
  };

  for (let i = 0; i < target; i += 1) {
    const ratio = target <= 1 ? 1 : i / (target - 1);
    const desiredDifficulty = 1 + Math.pow(ratio, 0.62) * 3;
    let question = pickNextByTargetDifficulty(desiredDifficulty);
    if (!question) {
      break;
    }
    ordered.push(question);
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

  return ordered.slice(0, target);
}

export function countUniqueQuizQuestions(data: RuntimeData): number {
  return generateQuizQuestions(data, Number.MAX_SAFE_INTEGER, { allowRepeats: false }).length;
}
