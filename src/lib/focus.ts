import { longestPrefixMatch } from "./geo";

export type FocusNode = {
  id: string;
  slug: string;
  parentId: string | null;
  depth: number;
  kind: "region" | "subregion" | "detail";
  regionKey: string | null;
  subregionSlug: string | null;
  detailSlug: string | null;
  bounds: [[number, number], [number, number]];
  fitPadding: { top: number; right: number; bottom: number; left: number };
  fitMaxZoom: number;
};

export type FocusGraph = {
  focusNodeById: Map<string, FocusNode>;
  focusChildrenByParentId: Map<string, string[]>;
  regionNodeIdByKey: Map<string, string>;
  subregionNodeIdBySlug: Map<string, string>;
  detailNodeIdBySlug: Map<string, string>;
};

export function buildFocusGraphFromNodes(nodes: FocusNode[]): FocusGraph {
  const focusNodeById = new Map<string, FocusNode>();
  const focusChildrenByParentId = new Map<string, string[]>();
  const regionNodeIdByKey = new Map<string, string>();
  const subregionNodeIdBySlug = new Map<string, string>();
  const detailNodeIdBySlug = new Map<string, string>();

  for (const node of nodes) {
    focusNodeById.set(node.id, node);
    const bucketKey = node.parentId ?? "__root__";
    const bucket = focusChildrenByParentId.get(bucketKey);
    if (bucket) {
      bucket.push(node.id);
    } else {
      focusChildrenByParentId.set(bucketKey, [node.id]);
    }

    if (node.kind === "region" && node.regionKey) {
      regionNodeIdByKey.set(node.regionKey, node.id);
    }
    if (node.kind === "subregion" && node.subregionSlug) {
      subregionNodeIdBySlug.set(node.subregionSlug, node.id);
    }
    if (node.kind === "detail" && node.detailSlug) {
      detailNodeIdBySlug.set(node.detailSlug, node.id);
    }
  }

  return {
    focusNodeById,
    focusChildrenByParentId,
    regionNodeIdByKey,
    subregionNodeIdBySlug,
    detailNodeIdBySlug,
  };
}

export function getFocusChain(nodeId: string | null, focusNodeById: Map<string, FocusNode>): FocusNode[] {
  const chain: FocusNode[] = [];
  let currentId = nodeId;
  while (currentId) {
    const node = focusNodeById.get(currentId);
    if (!node) {
      break;
    }
    chain.unshift(node);
    currentId = node.parentId;
  }
  return chain;
}

export function resolveHashToFocusNode(
  hash: string,
  focusChildrenByParentId: Map<string, string[]>,
  focusNodeById: Map<string, FocusNode>,
): string | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  let parentId: string | null = null;
  let remaining = normalized;
  let matchedNodeId: string | null = null;

  while (remaining) {
    const bucketKey = parentId ?? "__root__";
    const childIds = focusChildrenByParentId.get(bucketKey) ?? [];
    if (!childIds.length) {
      break;
    }
    const childSlugToId = new Map<string, string>();
    for (const childId of childIds) {
      const childNode = focusNodeById.get(childId);
      if (childNode) {
        childSlugToId.set(childNode.slug, childNode.id);
      }
    }
    const matchedSlug = longestPrefixMatch(remaining, [...childSlugToId.keys()]);
    if (!matchedSlug) {
      break;
    }
    const id = childSlugToId.get(matchedSlug);
    if (!id) {
      break;
    }
    matchedNodeId = id;
    parentId = id;

    if (remaining === matchedSlug) {
      break;
    }
    const prefix = `${matchedSlug}-`;
    remaining = remaining.startsWith(prefix) ? remaining.slice(prefix.length) : "";
  }

  return matchedNodeId;
}

export function hashForFocus(nodeId: string | null, focusNodeById: Map<string, FocusNode>): string {
  const parts = getFocusChain(nodeId, focusNodeById).map((node) => node.slug);
  return parts.length ? `#${parts.join("-")}` : "";
}
