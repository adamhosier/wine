import earcut from "earcut";
import { normalizeRing, type PolygonRings } from "./geo";

export type PreparedMaskPolygon = {
  lonLatVertices: Float64Array;
  triangleIndices: Uint32Array;
};

export function prepareMaskPolygons(polygons: PolygonRings[]): PreparedMaskPolygon[] {
  const prepared: PreparedMaskPolygon[] = [];

  for (const polygon of polygons) {
    const flattenedLonLat: number[] = [];
    const holeIndexes: number[] = [];
    let vertexCount = 0;

    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const cleanedRing = normalizeRing(polygon[ringIndex]);
      if (cleanedRing.length < 3) {
        continue;
      }
      if (ringIndex > 0) {
        holeIndexes.push(vertexCount);
      }
      for (const [lon, lat] of cleanedRing) {
        flattenedLonLat.push(lon, lat);
        vertexCount += 1;
      }
    }

    if (vertexCount < 3) {
      continue;
    }

    const triangles = earcut(flattenedLonLat, holeIndexes, 2);
    if (!triangles.length) {
      continue;
    }
    prepared.push({
      lonLatVertices: new Float64Array(flattenedLonLat),
      triangleIndices: Uint32Array.from(triangles),
    });
  }

  return prepared;
}

export function buildClipVertices(
  prepared: PreparedMaskPolygon[],
  project: (lon: number, lat: number) => { x: number; y: number },
  widthPixels: number,
  heightPixels: number,
  dpr: number,
): Float32Array {
  const trianglePointCount = prepared.reduce((count, polygon) => count + polygon.triangleIndices.length, 0);
  if (trianglePointCount === 0) {
    return new Float32Array(0);
  }

  const out = new Float32Array(trianglePointCount * 2);
  let outOffset = 0;

  for (const polygon of prepared) {
    const projected = new Float32Array(polygon.lonLatVertices.length);
    for (let i = 0; i < polygon.lonLatVertices.length; i += 2) {
      const point = project(polygon.lonLatVertices[i], polygon.lonLatVertices[i + 1]);
      projected[i] = point.x * dpr;
      projected[i + 1] = point.y * dpr;
    }

    for (let i = 0; i < polygon.triangleIndices.length; i += 1) {
      const vertexIndex = polygon.triangleIndices[i];
      const px = projected[vertexIndex * 2];
      const py = projected[vertexIndex * 2 + 1];
      out[outOffset] = (px / widthPixels) * 2 - 1;
      out[outOffset + 1] = 1 - (py / heightPixels) * 2;
      outOffset += 2;
    }
  }

  return out;
}
