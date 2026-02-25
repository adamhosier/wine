import type { PolygonRings } from "./geo";

export type MaskSelectionInput = {
  activeRegionKey: string | null;
  activeSubregionSlug: string | null;
  activeDetailSlug: string | null;
  allRegionPolygons: PolygonRings[];
  regionPolygonsByKey: Map<string, PolygonRings[]>;
  subregionPolygonsBySlug: Map<string, PolygonRings[]>;
  detailPolygonsBySlug: Map<string, PolygonRings[]>;
};

export function selectMaskPolygons(input: MaskSelectionInput): PolygonRings[] {
  const {
    activeRegionKey,
    activeSubregionSlug,
    activeDetailSlug,
    allRegionPolygons,
    regionPolygonsByKey,
    subregionPolygonsBySlug,
    detailPolygonsBySlug,
  } = input;

  if (activeDetailSlug) {
    return detailPolygonsBySlug.get(activeDetailSlug) ?? allRegionPolygons;
  }
  if (activeSubregionSlug) {
    return subregionPolygonsBySlug.get(activeSubregionSlug) ?? allRegionPolygons;
  }
  if (activeRegionKey) {
    return regionPolygonsByKey.get(activeRegionKey) ?? allRegionPolygons;
  }
  return allRegionPolygons;
}
