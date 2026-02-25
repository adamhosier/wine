import { stat } from "node:fs/promises";

export type Bbox = [number, number, number, number];

export function lonToTileX(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

export function latToTileY(lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor((1 - n / Math.PI) * (2 ** zoom) / 2);
}

export function tileRangeForBbox([minLon, minLat, maxLon, maxLat]: Bbox, zoom: number) {
  const xMin = Math.max(0, lonToTileX(minLon, zoom));
  const xMax = Math.max(0, lonToTileX(maxLon, zoom));
  const yMin = Math.max(0, latToTileY(maxLat, zoom));
  const yMax = Math.max(0, latToTileY(minLat, zoom));

  return {
    xMin: Math.min(xMin, xMax),
    xMax: Math.max(xMin, xMax),
    yMin: Math.min(yMin, yMax),
    yMax: Math.max(yMin, yMax),
  };
}

export function geometryBbox(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number, number, number] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const update = (lon: number, lat: number) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  };

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const [lon, lat] of ring) {
        update(lon, lat);
      }
    }
  } else {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          update(lon, lat);
        }
      }
    }
  }

  if (!Number.isFinite(minLon)) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat];
}

export async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(workers);
}

