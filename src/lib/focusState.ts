import { getFocusChain, type FocusNode } from "./focus";

export type ActiveFocusState = {
  nodeId: string | null;
  regionKey: string | null;
  subregionSlug: string | null;
  detailSlug: string | null;
};

export function deriveActiveFocusState(
  nodeId: string | null,
  focusNodeById: Map<string, FocusNode>,
): ActiveFocusState {
  const node = nodeId ? focusNodeById.get(nodeId) ?? null : null;
  return {
    nodeId: node?.id ?? null,
    regionKey: node?.regionKey ?? null,
    subregionSlug: node?.subregionSlug ?? null,
    detailSlug: node?.detailSlug ?? null,
  };
}

export function pruneFocusThresholds(
  thresholds: Map<string, number>,
  nodeId: string | null,
  focusNodeById: Map<string, FocusNode>,
) {
  if (!nodeId) {
    thresholds.clear();
    return;
  }

  const chainIds = new Set(getFocusChain(nodeId, focusNodeById).map((chainNode) => chainNode.id));
  for (const key of [...thresholds.keys()]) {
    if (!chainIds.has(key)) {
      thresholds.delete(key);
    }
  }
}

export function populateFocusThresholdsForChain(
  nodeId: string | null,
  focusNodeById: Map<string, FocusNode>,
  computeFitZoom: (node: FocusNode) => number | null,
  thresholds: Map<string, number>,
) {
  const chain = getFocusChain(nodeId, focusNodeById);
  for (const node of chain) {
    const zoom = computeFitZoom(node);
    if (zoom != null) {
      thresholds.set(node.id, zoom);
    }
  }
}

export function shouldPopFocusOnZoomOut(
  startZoom: number | null,
  endZoom: number,
  focusedNodeId: string | null,
  focusNodeById: Map<string, FocusNode>,
  thresholds: Map<string, number>,
  leeway: number,
): { pop: boolean; parentId: string | null } {
  if (startZoom == null || endZoom >= startZoom - 0.01) {
    return { pop: false, parentId: null };
  }
  if (!focusedNodeId) {
    return { pop: false, parentId: null };
  }
  const node = focusNodeById.get(focusedNodeId);
  if (!node) {
    return { pop: false, parentId: null };
  }
  const threshold = thresholds.get(node.id);
  if (threshold == null || endZoom >= threshold - leeway) {
    return { pop: false, parentId: null };
  }
  return { pop: true, parentId: node.parentId ?? null };
}
