export type PolygonRings = number[][][];

export function inBbox(
  lon: number,
  lat: number,
  [minLon, minLat, maxLon, maxLat]: [number, number, number, number],
) {
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

export function geometryBoundsCenter(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number] | null {
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

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) {
    return null;
  }
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

export function featureBounds(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [[number, number], [number, number]] | null {
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

  const geometry = "geometry" in feature ? feature.geometry : feature;
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
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export function clickedFeatureKey(feature: GeoJSON.Feature): string {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  if (typeof properties.iso_a3 === "string") {
    return properties.iso_a3;
  }
  if (typeof properties.name === "string") {
    return properties.name;
  }
  const id = feature.id;
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }
  return "";
}

export function regionSlug(feature: GeoJSON.Feature): string {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const raw =
    (typeof properties.name === "string" && properties.name) ||
    (typeof properties.iso_a3 === "string" && properties.iso_a3) ||
    clickedFeatureKey(feature);
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function polygonsFromGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): PolygonRings[] {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as PolygonRings];
  }
  return geometry.coordinates as PolygonRings[];
}

export function normalizeRing(ring: number[][]): number[][] {
  if (ring.length < 2) {
    return ring;
  }
  const [startLon, startLat] = ring[0];
  const [endLon, endLat] = ring[ring.length - 1];
  if (startLon === endLon && startLat === endLat) {
    return ring.slice(0, -1);
  }
  return ring;
}

export function longestPrefixMatch(value: string, candidates: string[]): string | null {
  let best: string | null = null;
  for (const candidate of candidates) {
    if (value === candidate || value.startsWith(`${candidate}-`)) {
      if (!best || candidate.length > best.length) {
        best = candidate;
      }
    }
  }
  return best;
}

