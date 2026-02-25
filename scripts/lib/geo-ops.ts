import simplify from "@turf/simplify";
import { feature } from "@turf/helpers";
import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "geojson";

export type Geometry = Polygon | MultiPolygon;

export function isPolygonGeometry(geometry: GeoJSON.Geometry | undefined): geometry is Geometry {
  return Boolean(geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon"));
}

export function toMultiPolygonCoords(geometry: Geometry): number[][][][] {
  return geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
}

export function fromMultiPolygonCoords(coords: number[][][][]): Geometry {
  if (coords.length === 1) {
    return {
      type: "Polygon",
      coordinates: coords[0],
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: coords,
  };
}

export function cleanGeometry(geometry: Geometry, tolerance: number): Geometry {
  const simplified = simplify(feature(geometry), {
    tolerance,
    highQuality: true,
    mutate: false,
  });
  return simplified.geometry as Geometry;
}

export function unionGeometries(geometries: Geometry[]): Geometry | null {
  if (!geometries.length) {
    return null;
  }

  let current = toMultiPolygonCoords(geometries[0]);
  for (let i = 1; i < geometries.length; i += 1) {
    const next = toMultiPolygonCoords(geometries[i]);
    try {
      current = polygonClipping.union(current as any, next as any) as number[][][][];
    } catch {
      // Keep best-effort union if a polygon is invalid.
    }
  }

  return current?.length ? fromMultiPolygonCoords(current) : null;
}

export function intersectGeometry(geometry: Geometry, clip: Geometry): Geometry | null {
  try {
    const clipped = polygonClipping.intersection(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(clip) as any,
    ) as number[][][][];
    if (!clipped?.length) {
      return null;
    }
    return fromMultiPolygonCoords(clipped);
  } catch {
    return geometry;
  }
}

export function subtractGeometry(geometry: Geometry, mask: Geometry): Geometry | null {
  try {
    const diff = polygonClipping.difference(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(mask) as any,
    ) as number[][][][];
    if (!diff?.length) {
      return null;
    }
    return fromMultiPolygonCoords(diff);
  } catch {
    return geometry;
  }
}

