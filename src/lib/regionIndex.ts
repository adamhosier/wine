import { clickedFeatureKey, featureBounds, polygonsFromGeometry, type PolygonRings } from "./geo";

type PolygonOrMulti = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type PolygonFeatureCollection = GeoJSON.FeatureCollection<PolygonOrMulti>;
type Bbox = [number, number, number, number];

export function buildRegionLabelByKey(regions: PolygonFeatureCollection): Map<string, string> {
  const map = new Map<string, string>();
  for (const feature of regions.features) {
    const key = clickedFeatureKey(feature as GeoJSON.Feature);
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    map.set(key, typeof properties.name === "string" ? properties.name : key);
  }
  return map;
}

export function collectRegionPolygons(regions: PolygonFeatureCollection): PolygonRings[] {
  const polygons: PolygonRings[] = [];
  for (const feature of regions.features) {
    polygons.push(...polygonsFromGeometry(feature.geometry));
  }
  return polygons;
}

export function buildRegionPolygonsByKey(regions: PolygonFeatureCollection): Map<string, PolygonRings[]> {
  const map = new Map<string, PolygonRings[]>();
  for (const feature of regions.features) {
    const key = clickedFeatureKey(feature as GeoJSON.Feature);
    map.set(key, polygonsFromGeometry(feature.geometry));
  }
  return map;
}

export function buildPolygonsBySlug(data: PolygonFeatureCollection): Map<string, PolygonRings[]> {
  const map = new Map<string, PolygonRings[]>();
  for (const feature of data.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const slug = typeof props.slug === "string" ? props.slug : "";
    if (slug) {
      map.set(slug, polygonsFromGeometry(feature.geometry));
    }
  }
  return map;
}

export function collectBboxes(data: PolygonFeatureCollection): Bbox[] {
  const bounds: Bbox[] = [];
  for (const feature of data.features) {
    const b = featureBounds(feature.geometry);
    if (!b) {
      continue;
    }
    bounds.push([b[0][0], b[0][1], b[1][0], b[1][1]]);
  }
  return bounds;
}

export function mergeBboxes(bounds: Bbox[], fallback: Bbox): Bbox {
  if (!bounds.length) {
    return fallback;
  }
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [bMinLon, bMinLat, bMaxLon, bMaxLat] of bounds) {
    if (bMinLon < minLon) minLon = bMinLon;
    if (bMinLat < minLat) minLat = bMinLat;
    if (bMaxLon > maxLon) maxLon = bMaxLon;
    if (bMaxLat > maxLat) maxLat = bMaxLat;
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return fallback;
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function findRegionBoundsByKey(regions: PolygonFeatureCollection, key: string): Bbox | null {
  const region = regions.features.find((feature) => clickedFeatureKey(feature as GeoJSON.Feature) === key);
  if (!region) {
    return null;
  }
  const b = featureBounds(region.geometry);
  if (!b) {
    return null;
  }
  return [b[0][0], b[0][1], b[1][0], b[1][1]];
}
