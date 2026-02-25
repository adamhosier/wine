import type { PolygonRings } from "./geo";

export type MaskSelectionInput = {
  activeNodeId: string | null;
  allRootPolygons: PolygonRings[];
  polygonsByNodeId: Map<string, PolygonRings[]>;
};

export function selectMaskPolygons(input: MaskSelectionInput): PolygonRings[] {
  const { activeNodeId, allRootPolygons, polygonsByNodeId } = input;
  if (!activeNodeId) {
    return allRootPolygons;
  }
  return polygonsByNodeId.get(activeNodeId) ?? allRootPolygons;
}
