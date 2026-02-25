import type { PolygonRings } from "./geo";

const WORLD_RING: number[][] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

function closeRing(ring: number[][]): number[][] {
  if (ring.length < 3) {
    return ring;
  }
  const [startLon, startLat] = ring[0];
  const [endLon, endLat] = ring[ring.length - 1];
  if (startLon === endLon && startLat === endLat) {
    return ring;
  }
  return [...ring, [startLon, startLat]];
}

export function toFocusMaskData(
  activePolygons: PolygonRings[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const holes: number[][][] = [];
  for (const polygon of activePolygons) {
    const outer = polygon[0];
    if (!outer || outer.length < 3) {
      continue;
    }
    holes.push(closeRing(outer));
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [WORLD_RING, ...holes],
        },
      },
    ],
  };
}

export function toFocusEdgeData(
  activePolygons: PolygonRings[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: activePolygons
      .map((polygon, index) => {
        const outer = polygon[0];
        if (!outer || outer.length < 3) {
          return null;
        }
        return {
          type: "Feature",
          id: index,
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [closeRing(outer)],
          },
        } as GeoJSON.Feature<GeoJSON.Polygon>;
      })
      .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon> => feature != null),
  };
}
