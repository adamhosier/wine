import { inBbox } from "./geo";

export type DebugSnapshot = {
  zoom: number;
  centerLon: number;
  centerLat: number;
  source: string;
};

export function describeTileSource(
  zoom: number,
  centerLon: number,
  centerLat: number,
  franceBounds: [number, number, number, number],
  subregionBounds: Array<[number, number, number, number]>,
  zHi: number,
  zSubregionMid: number,
  zSubregionHi: number,
): string {
  const inFrance = inBbox(centerLon, centerLat, franceBounds);
  const inWineSubregion = subregionBounds.some((bbox) => inBbox(centerLon, centerLat, bbox));

  if (zoom >= zSubregionHi && inWineSubregion) {
    return "Local Subregion Ultra + Mid + France + NASA fallback";
  }
  if (zoom >= zSubregionMid && inWineSubregion) {
    return "Local Subregion Mid + France + NASA fallback";
  }
  if (zoom >= zHi && inFrance) {
    return "Local France + NASA fallback";
  }
  return "NASA";
}

export function hasMeaningfulDebugDelta(previous: DebugSnapshot | null, next: DebugSnapshot): boolean {
  if (!previous) {
    return true;
  }
  return (
    Math.abs(previous.zoom - next.zoom) >= 0.01 ||
    Math.abs(previous.centerLon - next.centerLon) >= 0.0002 ||
    Math.abs(previous.centerLat - next.centerLat) >= 0.0002 ||
    previous.source !== next.source
  );
}
