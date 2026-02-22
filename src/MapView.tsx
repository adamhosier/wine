import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type LngLatLike, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import earcut from "earcut";
import regionsGeoJsonRaw from "./data/regions.geojson?raw";
import franceSubregionsGeoJsonRaw from "./data/france-wine-subregions.geojson?raw";
import burgundyDetailSubregionsGeoJsonRaw from "./data/burgundy-detail-subregions.geojson?raw";
import burgundyWaypointsGeoJsonRaw from "./data/burgundy-waypoints.geojson?raw";
import {
  FRANCE_BBOX,
  HI_Z_DELTA,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  LOCAL_TILE_RELATIVE_TEMPLATE,
  NASA_LAYER,
  NASA_TILE_FORMAT,
  NASA_TILE_MATRIX_SET,
  NASA_TIME,
  SUBREGION_REMOTE_TILE_TEMPLATE,
  SUBREGION_MID_TILE_RELATIVE_TEMPLATE,
  SUBREGION_MID_Z_DELTA,
  SUBREGION_HI_Z_DELTA,
  SUBREGION_TILE_RELATIVE_TEMPLATE,
  Z_BASE,
  Z_HI,
  Z_SUBREGION_MID,
  Z_SUBREGION_HI,
} from "./config";

type PolygonRings = number[][][];
type RegionsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type RegionFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type SubregionsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type WaypointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;
type DetailFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const REGIONS_DATA = JSON.parse(regionsGeoJsonRaw) as RegionsFeatureCollection;
const WINE_SUBREGIONS_DATA = JSON.parse(franceSubregionsGeoJsonRaw) as SubregionsFeatureCollection;
const WINE_DETAIL_SUBREGIONS_DATA = JSON.parse(
  burgundyDetailSubregionsGeoJsonRaw,
) as DetailFeatureCollection;
const BURGUNDY_WAYPOINTS = JSON.parse(burgundyWaypointsGeoJsonRaw) as WaypointFeatureCollection;
const WAYPOINTS_MAX_ZOOM = 4.6;
const UNFOCUS_ZOOM_LEEWAY = 0.35;

function inBbox(lon: number, lat: number, [minLon, minLat, maxLon, maxLat]: [number, number, number, number]) {
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function geometryBoundsCenter(
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

function buildSubregionWaypoints(collections: SubregionsFeatureCollection[]): WaypointFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const subregion of collection.features) {
      const center = geometryBoundsCenter(subregion.geometry);
      if (!center) {
        continue;
      }
      const props = (subregion.properties ?? {}) as Record<string, unknown>;
      const slug =
        (typeof props.slug === "string" && props.slug) ||
        (typeof subregion.id === "string" && subregion.id) ||
        "";
      if (slug && seen.has(slug)) {
        continue;
      }
      if (slug) {
        seen.add(slug);
      }
      const name =
        (typeof props.name === "string" && props.name) ||
        (typeof props.slug === "string" && props.slug) ||
        "Subregion";

      features.push({
        type: "Feature",
        id: slug || undefined,
        properties: {
          name,
          slug: slug || null,
          parent_iso_a3: typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : null,
          parent_node_id:
            typeof props.parent_iso_a3 === "string" ? `region:${props.parent_iso_a3}` : null,
          waypoint_level: "subregion",
        },
        geometry: {
          type: "Point",
          coordinates: center,
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildDetailWaypoints(collections: DetailFeatureCollection[]): WaypointFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const detail of collection.features) {
      const center = geometryBoundsCenter(detail.geometry);
      if (!center) {
        continue;
      }
      const props = (detail.properties ?? {}) as Record<string, unknown>;
      const slug =
        (typeof props.slug === "string" && props.slug) ||
        (typeof detail.id === "string" && detail.id) ||
        "";
      if (slug && seen.has(slug)) {
        continue;
      }
      if (slug) {
        seen.add(slug);
      }
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : null;
      const name =
        (typeof props.name === "string" && props.name) ||
        (typeof props.slug === "string" && props.slug) ||
        "Detail";

      features.push({
        type: "Feature",
        id: slug || undefined,
        properties: {
          name,
          slug: slug || null,
          parent_slug: parentSlug,
          parent_node_id: parentSlug ? `subregion:${parentSlug}` : null,
          waypoint_level: "detail",
        },
        geometry: {
          type: "Point",
          coordinates: center,
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildExplicitWaypoints(collections: WaypointFeatureCollection[]): WaypointFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const collection of collections) {
    for (const waypoint of collection.features) {
      const props = (waypoint.properties ?? {}) as Record<string, unknown>;
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : null;
      features.push({
        type: "Feature",
        id: waypoint.id,
        properties: {
          ...props,
          parent_slug: parentSlug,
          parent_node_id: parentSlug ? `subregion:${parentSlug}` : null,
          waypoint_level: "detail",
        },
        geometry: waypoint.geometry,
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function mergeWaypoints(collections: WaypointFeatureCollection[]): WaypointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((collection) => collection.features),
  };
}

function toLocalTileTemplate() {
  return `${import.meta.env.BASE_URL}${LOCAL_TILE_RELATIVE_TEMPLATE}`;
}

function toSubregionLocalTileTemplate() {
  return `${import.meta.env.BASE_URL}${SUBREGION_TILE_RELATIVE_TEMPLATE}`;
}

function toSubregionMidLocalTileTemplate() {
  return `${import.meta.env.BASE_URL}${SUBREGION_MID_TILE_RELATIVE_TEMPLATE}`;
}

function toSubregionRemoteTileTemplate() {
  return SUBREGION_REMOTE_TILE_TEMPLATE;
}

function toNasaTileTemplate() {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/${NASA_TIME}/${NASA_TILE_MATRIX_SET}/{z}/{y}/{x}.${NASA_TILE_FORMAT}`;
}

function createMapStyle(
  localTilesTemplate: string,
  subregionMidTilesTemplate: string,
  subregionTilesTemplate: string,
): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      nasa: {
        type: "raster",
        tiles: [toNasaTileTemplate()],
        tileSize: 256,
        attribution: "Imagery: NASA GIBS",
      },
      france_local: {
        type: "raster",
        tiles: [localTilesTemplate],
        tileSize: 256,
        bounds: FRANCE_BBOX,
      },
      france_subregion_local: {
        type: "raster",
        tiles: [subregionTilesTemplate, toSubregionRemoteTileTemplate()],
        tileSize: 256,
      },
      france_subregion_mid_local: {
        type: "raster",
        tiles: [subregionMidTilesTemplate, toSubregionRemoteTileTemplate()],
        tileSize: 256,
      },
    },
    layers: [
      { id: "nasa-base", type: "raster", source: "nasa" },
      { id: "france-local", type: "raster", source: "france_local", minzoom: Z_HI },
      {
        id: "france-subregion-mid-local",
        type: "raster",
        source: "france_subregion_mid_local",
        minzoom: Z_SUBREGION_MID,
        maxzoom: Z_SUBREGION_HI,
      },
      { id: "france-subregion-local", type: "raster", source: "france_subregion_local", minzoom: Z_SUBREGION_HI },
    ],
  };
}

function createPoiStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {},
    layers: [],
  };
}

function normalizeRing(ring: number[][]): number[][] {
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

function addVectorLayers(map: MapLibreMap, waypoints: WaypointFeatureCollection, includeWaypoints = true) {
  if (!map.getSource("regions")) {
    map.addSource("regions", { type: "geojson", data: REGIONS_DATA as GeoJSON.GeoJSON });
  }
  if (!map.getLayer("regions-hit-fill")) {
    map.addLayer({
      id: "regions-hit-fill",
      type: "fill",
      source: "regions",
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0,
      },
    });
  }
  if (!map.getLayer("regions-outline")) {
    map.addLayer({
      id: "regions-outline",
      type: "line",
      source: "regions",
      paint: {
        "line-color": "#7a1f2b",
        "line-width": 2,
      },
    });
  }
  if (includeWaypoints) {
    if (!map.getSource("waypoints")) {
      map.addSource("waypoints", { type: "geojson", data: waypoints as GeoJSON.GeoJSON });
    }
    if (!map.getLayer("waypoints-circle")) {
      map.addLayer({
        id: "waypoints-circle",
        type: "circle",
        source: "waypoints",
        layout: {
          visibility: "none",
        },
        paint: {
          "circle-color": "#ff8f00",
          "circle-stroke-color": "#2a2a2a",
          "circle-stroke-width": 1.25,
          "circle-radius": 4,
        },
      });
    }
    if (!map.getLayer("waypoints-label")) {
      map.addLayer({
        id: "waypoints-label",
        type: "symbol",
        source: "waypoints",
        layout: {
          visibility: "none",
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.1],
        },
        paint: {
          "text-color": "#fffde7",
          "text-halo-color": "#212121",
          "text-halo-width": 1.2,
        },
      });
    }
  }
}

function addFranceSubregionLayers(map: MapLibreMap, data: SubregionsFeatureCollection) {
  if (!map.getSource("france-subregions")) {
    map.addSource("france-subregions", {
      type: "geojson",
      data: data as GeoJSON.GeoJSON,
    });
  }
  if (!map.getLayer("france-subregions-line")) {
    map.addLayer({
      id: "france-subregions-line",
      type: "line",
      source: "france-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "line-color": "#a65d62",
        "line-width": 1.3,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("france-subregions-hit-fill")) {
    map.addLayer({
      id: "france-subregions-hit-fill",
      type: "fill",
      source: "france-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0,
      },
    });
  }
}

function addBurgundyDetailLayers(map: MapLibreMap) {
  if (!map.getSource("burgundy-detail-subregions")) {
    map.addSource("burgundy-detail-subregions", {
      type: "geojson",
      data: WINE_DETAIL_SUBREGIONS_DATA as GeoJSON.GeoJSON,
    });
  }
  if (!map.getLayer("burgundy-detail-subregions-line")) {
    map.addLayer({
      id: "burgundy-detail-subregions-line",
      type: "line",
      source: "burgundy-detail-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "line-color": "#c8888c",
        "line-width": 1.4,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("burgundy-detail-subregions-hit-fill")) {
    map.addLayer({
      id: "burgundy-detail-subregions-hit-fill",
      type: "fill",
      source: "burgundy-detail-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0,
      },
    });
  }
}

function featureBounds(
  feature: RegionFeature | GeoJSON.Polygon | GeoJSON.MultiPolygon,
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

function clickedFeatureKey(feature: GeoJSON.Feature): string {
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

function regionSlug(feature: GeoJSON.Feature): string {
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

function polygonsFromGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): PolygonRings[] {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as PolygonRings];
  }
  return geometry.coordinates as PolygonRings[];
}

function longestPrefixMatch(value: string, candidates: string[]): string | null {
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

type DebugSnapshot = {
  zoom: number;
  centerLon: number;
  centerLat: number;
  source: string;
};

type FocusNode = {
  id: string;
  slug: string;
  parentId: string | null;
  depth: number;
  kind: "region" | "subregion" | "detail";
  regionKey: string | null;
  subregionSlug: string | null;
  detailSlug: string | null;
  bounds: [[number, number], [number, number]];
  fitPadding: { top: number; right: number; bottom: number; left: number };
  fitMaxZoom: number;
};

export default function MapView() {
  const waypoints = useMemo(
    () =>
      mergeWaypoints([
        buildSubregionWaypoints([WINE_SUBREGIONS_DATA]),
        buildDetailWaypoints([WINE_DETAIL_SUBREGIONS_DATA]),
        buildExplicitWaypoints([BURGUNDY_WAYPOINTS]),
      ]),
    [],
  );

  const processedMapContainerRef = useRef<HTMLDivElement | null>(null);
  const normalMapContainerRef = useRef<HTMLDivElement | null>(null);
  const poiMapContainerRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const processedMapRef = useRef<MapLibreMap | null>(null);
  const normalMapRef = useRef<MapLibreMap | null>(null);
  const poiMapRef = useRef<MapLibreMap | null>(null);
  const activeFocusNodeIdRef = useRef<string | null>(null);
  const activeRegionKeyRef = useRef<string | null>(null);
  const activeSubregionSlugRef = useRef<string | null>(null);
  const activeDetailSlugRef = useRef<string | null>(null);
  const focusZoomByNodeIdRef = useRef<Map<string, number>>(new Map());
  const zoomGestureStartRef = useRef<number | null>(null);
  const isProgrammaticCameraRef = useRef(false);

  const [debug, setDebug] = useState<DebugSnapshot>({
    zoom: INITIAL_ZOOM,
    centerLon: INITIAL_CENTER[0],
    centerLat: INITIAL_CENTER[1],
    source: "NASA",
  });
  const [activeRegionKey, setActiveRegionKey] = useState<string | null>(null);
  const [activeSubregionSlug, setActiveSubregionSlug] = useState<string | null>(null);
  const [activeDetailSlug, setActiveDetailSlug] = useState<string | null>(null);

  const regionLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      map.set(key, typeof properties.name === "string" ? properties.name : key);
    }
    return map;
  }, []);

  const regionPolygons = useMemo<PolygonRings[]>(() => {
    const polygons: PolygonRings[] = [];
    for (const feature of REGIONS_DATA.features) {
      for (const polygon of polygonsFromGeometry(feature.geometry)) {
        polygons.push(polygon);
      }
    }
    return polygons;
  }, []);

  const regionPolygonsByKey = useMemo(() => {
    const map = new Map<string, PolygonRings[]>();
    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      map.set(key, polygonsFromGeometry(feature.geometry));
    }
    return map;
  }, []);

  const subregionPolygonsBySlug = useMemo(() => {
    const map = new Map<string, PolygonRings[]>();
    for (const feature of WINE_SUBREGIONS_DATA.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      if (slug) {
        map.set(slug, polygonsFromGeometry(feature.geometry));
      }
    }
    return map;
  }, []);

  const subregionBounds = useMemo<Array<[number, number, number, number]>>(() => {
    const bounds: Array<[number, number, number, number]> = [];
    for (const feature of WINE_SUBREGIONS_DATA.features) {
      const b = featureBounds(feature.geometry);
      if (!b) {
        continue;
      }
      const [[minLon, minLat], [maxLon, maxLat]] = b;
      bounds.push([minLon, minLat, maxLon, maxLat]);
    }
    return bounds;
  }, []);

  const burgundyDetailPolygonsBySlug = useMemo(() => {
    const map = new Map<string, PolygonRings[]>();
    for (const feature of WINE_DETAIL_SUBREGIONS_DATA.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      if (slug) {
        map.set(slug, polygonsFromGeometry(feature.geometry));
      }
    }
    return map;
  }, []);

  const {
    focusNodeById,
    focusChildrenByParentId,
    regionNodeIdByKey,
    subregionNodeIdBySlug,
    detailNodeIdBySlug,
  } = useMemo(() => {
    const nodes = new Map<string, FocusNode>();
    const children = new Map<string, string[]>();
    const regionIds = new Map<string, string>();
    const subregionIds = new Map<string, string>();
    const detailIds = new Map<string, string>();

    const addChild = (parentId: string | null, id: string) => {
      const key = parentId ?? "__root__";
      const bucket = children.get(key);
      if (bucket) {
        bucket.push(id);
      } else {
        children.set(key, [id]);
      }
    };

    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      const bounds = featureBounds(feature.geometry);
      const slug = regionSlug(feature as GeoJSON.Feature);
      if (!bounds || !slug) {
        continue;
      }
      const id = `region:${key}`;
      nodes.set(id, {
        id,
        slug,
        parentId: null,
        depth: 0,
        kind: "region",
        regionKey: key,
        subregionSlug: null,
        detailSlug: null,
        bounds,
        fitPadding: { top: 56, right: 56, bottom: 56, left: 56 },
        fitMaxZoom: 6.2,
      });
      addChild(null, id);
      regionIds.set(key, id);
    }

    for (const feature of WINE_SUBREGIONS_DATA.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      const parentIsoA3 = typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : "";
      const bounds = featureBounds(feature.geometry);
      if (!slug || !bounds || !parentIsoA3) {
        continue;
      }
      const parentId = regionIds.get(parentIsoA3);
      if (!parentId) {
        continue;
      }
      const id = `subregion:${slug}`;
      nodes.set(id, {
        id,
        slug,
        parentId,
        depth: 1,
        kind: "subregion",
        regionKey: parentIsoA3,
        subregionSlug: slug,
        detailSlug: null,
        bounds,
        fitPadding: { top: 48, right: 48, bottom: 48, left: 48 },
        fitMaxZoom: Math.max(7.4, Z_SUBREGION_HI - 1.2),
      });
      addChild(parentId, id);
      subregionIds.set(slug, id);
    }

    for (const feature of WINE_DETAIL_SUBREGIONS_DATA.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : "";
      const bounds = featureBounds(feature.geometry);
      if (!slug || !bounds || !parentSlug) {
        continue;
      }
      const parentId = subregionIds.get(parentSlug);
      if (!parentId) {
        continue;
      }
      const parentNode = nodes.get(parentId);
      if (!parentNode) {
        continue;
      }
      const id = `detail:${slug}`;
      nodes.set(id, {
        id,
        slug,
        parentId,
        depth: 2,
        kind: "detail",
        regionKey: parentNode.regionKey,
        subregionSlug: parentNode.subregionSlug,
        detailSlug: slug,
        bounds,
        fitPadding: { top: 40, right: 40, bottom: 40, left: 40 },
        fitMaxZoom: Math.max(8.2, Z_SUBREGION_HI + 0.2),
      });
      addChild(parentId, id);
      detailIds.set(slug, id);
    }

    return {
      focusNodeById: nodes,
      focusChildrenByParentId: children,
      regionNodeIdByKey: regionIds,
      subregionNodeIdBySlug: subregionIds,
      detailNodeIdBySlug: detailIds,
    };
  }, []);

  useEffect(() => {
    const processedContainer = processedMapContainerRef.current;
    const normalContainer = normalMapContainerRef.current;
    const poiContainer = poiMapContainerRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!processedContainer || !normalContainer || !poiContainer || !maskCanvas) {
      return;
    }

    const processedMap = new maplibregl.Map({
      container: processedContainer,
      style: createMapStyle(
        toLocalTileTemplate(),
        toSubregionMidLocalTileTemplate(),
        toSubregionLocalTileTemplate(),
      ),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      interactive: false,
      attributionControl: false,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
      renderWorldCopies: false,
    });
    const normalMap = new maplibregl.Map({
      container: normalContainer,
      style: createMapStyle(
        toLocalTileTemplate(),
        toSubregionMidLocalTileTemplate(),
        toSubregionLocalTileTemplate(),
      ),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
      renderWorldCopies: false,
    });
    const poiMap = new maplibregl.Map({
      container: poiContainer,
      style: createPoiStyle(),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      interactive: false,
      attributionControl: false,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
      renderWorldCopies: false,
    });

    processedMapRef.current = processedMap;
    normalMapRef.current = normalMap;
    poiMapRef.current = poiMap;

    let synchronizing = false;
    const syncMirrorMaps = () => {
      if (synchronizing || !normalMapRef.current) {
        return;
      }
      synchronizing = true;
      const liveMap = normalMapRef.current;
      const camera = {
        center: liveMap.getCenter(),
        zoom: liveMap.getZoom(),
        pitch: liveMap.getPitch(),
        bearing: liveMap.getBearing(),
      };
      processedMapRef.current?.jumpTo(camera);
      poiMapRef.current?.jumpTo(camera);
      synchronizing = false;
    };

    const setDebugSnapshot = () => {
      const map = normalMapRef.current;
      if (!map) {
        return;
      }
      const zoom = map.getZoom();
      const center = map.getCenter();
      const inFrance = inBbox(center.lng, center.lat, FRANCE_BBOX);
      const inWineSubregion = subregionBounds.some((bbox) => inBbox(center.lng, center.lat, bbox));
      const usingSubregionMid = zoom >= Z_SUBREGION_MID && inWineSubregion;
      const usingSubregionLocal = zoom >= Z_SUBREGION_HI && inWineSubregion;
      const usingLocal = zoom >= Z_HI && inFrance;
      setDebug({
        zoom,
        centerLon: center.lng,
        centerLat: center.lat,
        source: usingSubregionLocal
          ? "Local Subregion Ultra + Mid + France + NASA fallback"
          : usingSubregionMid
            ? "Local Subregion Mid + France + NASA fallback"
          : usingLocal
            ? "Local France + NASA fallback"
            : "NASA",
      });
    };

    const getFocusChain = (nodeId: string | null): FocusNode[] => {
      const chain: FocusNode[] = [];
      let currentId = nodeId;
      while (currentId) {
        const node = focusNodeById.get(currentId);
        if (!node) {
          break;
        }
        chain.unshift(node);
        currentId = node.parentId;
      }
      return chain;
    };

    const setWaypointVisibility = (nodeId: string | null) => {
      const map = poiMapRef.current;
      if (!map) {
        return;
      }

      const node = nodeId ? focusNodeById.get(nodeId) ?? null : null;
      const showGlobalSubregionWaypoints = !node && map.getZoom() <= WAYPOINTS_MAX_ZOOM;
      const showChildWaypoints = !!node;
      const shouldShow = showGlobalSubregionWaypoints || showChildWaypoints;

      let filter: maplibregl.FilterSpecification | null = null;
      if (showGlobalSubregionWaypoints) {
        filter = ["==", ["get", "waypoint_level"], "subregion"] as maplibregl.FilterSpecification;
      } else if (showChildWaypoints && node) {
        filter = ["==", ["get", "parent_node_id"], node.id] as maplibregl.FilterSpecification;
      }

      const visibility = shouldShow ? "visible" : "none";
      if (map.getLayer("waypoints-circle")) {
        map.setLayoutProperty("waypoints-circle", "visibility", visibility);
        map.setFilter("waypoints-circle", filter);
      }
      if (map.getLayer("waypoints-label")) {
        map.setLayoutProperty("waypoints-label", "visibility", visibility);
        map.setFilter("waypoints-label", filter);
      }
    };

    const setHashForFocus = () => {
      const parts = getFocusChain(activeFocusNodeIdRef.current).map((node) => node.slug);
      const nextHash = parts.length ? `#${parts.join("-")}` : "";
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
        window.history.replaceState(null, "", nextUrl);
      }
    };

    const resolveHashToFocusNode = (hash: string): string | null => {
      const normalized = hash.trim().toLowerCase();
      if (!normalized) {
        return null;
      }

      let parentId: string | null = null;
      let remaining = normalized;
      let matchedNodeId: string | null = null;

      while (remaining) {
        const bucketKey = parentId ?? "__root__";
        const childIds = focusChildrenByParentId.get(bucketKey) ?? [];
        if (!childIds.length) {
          break;
        }
        const childSlugToId = new Map<string, string>();
        for (const childId of childIds) {
          const childNode = focusNodeById.get(childId);
          if (childNode) {
            childSlugToId.set(childNode.slug, childNode.id);
          }
        }
        const matchedSlug = longestPrefixMatch(remaining, [...childSlugToId.keys()]);
        if (!matchedSlug) {
          break;
        }
        const id = childSlugToId.get(matchedSlug);
        if (!id) {
          break;
        }
        matchedNodeId = id;
        parentId = id;

        if (remaining === matchedSlug) {
          break;
        }
        const prefix = `${matchedSlug}-`;
        remaining = remaining.startsWith(prefix) ? remaining.slice(prefix.length) : "";
      }

      return matchedNodeId;
    };

    const setOutlineFocusFilter = (key: string | null) => {
      const outlineFilter: maplibregl.FilterSpecification | null = key
        ? (["==", ["get", "iso_a3"], key] as maplibregl.FilterSpecification)
        : null;
      for (const map of [normalMapRef.current, processedMapRef.current]) {
        if (map?.getLayer("regions-outline")) {
          map.setFilter("regions-outline", outlineFilter);
        }
      }
    };

    const setSubregionsVisibility = (key: string | null) => {
      const visibility = key ? "visible" : "none";
      const map = normalMapRef.current;
      if (!map) {
        return;
      }
      const filter: maplibregl.FilterSpecification | null = key
        ? (["==", ["get", "parent_iso_a3"], key] as maplibregl.FilterSpecification)
        : null;
      if (map.getLayer("france-subregions-line")) {
        map.setLayoutProperty("france-subregions-line", "visibility", visibility);
        map.setFilter("france-subregions-line", filter);
      }
      if (map.getLayer("france-subregions-hit-fill")) {
        map.setLayoutProperty("france-subregions-hit-fill", "visibility", visibility);
        map.setFilter("france-subregions-hit-fill", filter);
      }
    };

    const setDetailVisibility = (subregionSlug: string | null) => {
      const map = normalMapRef.current;
      if (!map) {
        return;
      }
      const subregionNodeId = subregionSlug ? subregionNodeIdBySlug.get(subregionSlug) ?? null : null;
      const hasDetailChildren = subregionNodeId
        ? (focusChildrenByParentId.get(subregionNodeId) ?? []).some((childId) => {
            const child = focusNodeById.get(childId);
            return child?.kind === "detail";
          })
        : false;
      const visibility = hasDetailChildren ? "visible" : "none";
      const filter: maplibregl.FilterSpecification | null = subregionSlug
        ? (["==", ["get", "parent_slug"], subregionSlug] as maplibregl.FilterSpecification)
        : null;
      const ids = [
        "burgundy-detail-subregions-hit-fill",
        "burgundy-detail-subregions-line",
      ];
      for (const id of ids) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visibility);
          map.setFilter(id, filter);
        }
      }
    };

    let gl: WebGLRenderingContext | null = null;
    let glProgram: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let positionAttribLocation = -1;
    const featherCanvas = document.createElement("canvas");
    const featherCtx = featherCanvas.getContext("2d");

    const createMaskProgram = () => {
      gl = maskCanvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) {
        return;
      }

      const vertexShaderSource = `
        attribute vec2 a_position;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;
      const fragmentShaderSource = `
        precision mediump float;
        void main() {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
      `;

      const createShader = (type: number, source: string) => {
        if (!gl) {
          return null;
        }
        const shader = gl.createShader(type);
        if (!shader) {
          return null;
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
      if (!vertexShader || !fragmentShader) {
        return;
      }
      glProgram = gl.createProgram();
      if (!glProgram) {
        return;
      }
      gl.attachShader(glProgram, vertexShader);
      gl.attachShader(glProgram, fragmentShader);
      gl.linkProgram(glProgram);
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        gl.deleteProgram(glProgram);
        glProgram = null;
        return;
      }

      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      positionBuffer = gl.createBuffer();
      positionAttribLocation = gl.getAttribLocation(glProgram, "a_position");
    };

    const renderMask = () => {
      const map = normalMapRef.current;
      if (!map || !gl || !glProgram || !positionBuffer || positionAttribLocation < 0) {
        return;
      }

      const widthCss = normalContainer.clientWidth;
      const heightCss = normalContainer.clientHeight;
      if (widthCss < 2 || heightCss < 2) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const widthPixels = Math.max(1, Math.floor(widthCss * dpr));
      const heightPixels = Math.max(1, Math.floor(heightCss * dpr));
      if (maskCanvas.width !== widthPixels || maskCanvas.height !== heightPixels) {
        maskCanvas.width = widthPixels;
        maskCanvas.height = heightPixels;
        featherCanvas.width = widthPixels;
        featherCanvas.height = heightPixels;
      }

      const focusedKey = activeRegionKeyRef.current;
      const focusedSubregion = activeSubregionSlugRef.current;
      const focusedDetail = activeDetailSlugRef.current;
      let polygons = regionPolygons;
      if (focusedDetail) {
        polygons = burgundyDetailPolygonsBySlug.get(focusedDetail) ?? polygons;
      } else if (focusedSubregion) {
        polygons = subregionPolygonsBySlug.get(focusedSubregion) ?? polygons;
      } else if (focusedKey) {
        polygons = regionPolygonsByKey.get(focusedKey) ?? polygons;
      }

      const clipVertices: number[] = [];
      for (const polygon of polygons) {
        const flattenedPoints: number[] = [];
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
            const screen = map.project([lon, lat]);
            flattenedPoints.push(screen.x * dpr, screen.y * dpr);
            vertexCount += 1;
          }
        }

        if (vertexCount < 3) {
          continue;
        }

        const triangles = earcut(flattenedPoints, holeIndexes, 2);
        for (const triangleIndex of triangles) {
          const px = flattenedPoints[triangleIndex * 2];
          const py = flattenedPoints[triangleIndex * 2 + 1];
          clipVertices.push((px / widthPixels) * 2 - 1, 1 - (py / heightPixels) * 2);
        }
      }

      gl.viewport(0, 0, widthPixels, heightPixels);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (clipVertices.length === 0) {
        normalContainer.style.maskImage = "none";
        normalContainer.style.webkitMaskImage = "none";
        return;
      }

      gl.useProgram(glProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(clipVertices), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(positionAttribLocation);
      gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, clipVertices.length / 2);

      let maskUrl = maskCanvas.toDataURL("image/png");
      if (featherCtx) {
        featherCtx.clearRect(0, 0, widthPixels, heightPixels);
        featherCtx.filter = "blur(1.75px)";
        featherCtx.drawImage(maskCanvas, 0, 0, widthPixels, heightPixels);
        featherCtx.filter = "none";
        maskUrl = featherCanvas.toDataURL("image/png");
      }
      normalContainer.style.maskImage = `url("${maskUrl}")`;
      normalContainer.style.maskSize = "100% 100%";
      normalContainer.style.maskRepeat = "no-repeat";
      normalContainer.style.maskPosition = "center";
      normalContainer.style.webkitMaskImage = `url("${maskUrl}")`;
      normalContainer.style.webkitMaskSize = "100% 100%";
      normalContainer.style.webkitMaskRepeat = "no-repeat";
      normalContainer.style.webkitMaskPosition = "center";
    };

    const runProgrammaticCamera = (move: () => void, fallbackMs: number, onSettled?: () => void) => {
      isProgrammaticCameraRef.current = true;
      let settled = false;
      const settle = () => {
        if (settled) {
          return;
        }
        settled = true;
        isProgrammaticCameraRef.current = false;
        onSettled?.();
      };
      normalMap.once("moveend", settle);
      window.setTimeout(settle, fallbackMs);
      move();
    };

    const setFocusState = (nodeId: string | null, updateHash: boolean) => {
      const node = nodeId ? focusNodeById.get(nodeId) ?? null : null;

      activeFocusNodeIdRef.current = node?.id ?? null;
      activeRegionKeyRef.current = node?.regionKey ?? null;
      activeSubregionSlugRef.current = node?.subregionSlug ?? null;
      activeDetailSlugRef.current = node?.detailSlug ?? null;

      if (!node) {
        focusZoomByNodeIdRef.current.clear();
      } else {
        const chainIds = new Set(getFocusChain(node.id).map((chainNode) => chainNode.id));
        for (const id of [...focusZoomByNodeIdRef.current.keys()]) {
          if (!chainIds.has(id)) {
            focusZoomByNodeIdRef.current.delete(id);
          }
        }
      }

      setActiveRegionKey(activeRegionKeyRef.current);
      setActiveSubregionSlug(activeSubregionSlugRef.current);
      setActiveDetailSlug(activeDetailSlugRef.current);
      setOutlineFocusFilter(activeRegionKeyRef.current);
      setSubregionsVisibility(activeRegionKeyRef.current);
      setDetailVisibility(activeSubregionSlugRef.current);
      setWaypointVisibility(activeFocusNodeIdRef.current);
      renderMask();
      if (updateHash) {
        setHashForFocus();
      }
    };

    const computeFitZoom = (node: FocusNode): number | null => {
      const camera = normalMap.cameraForBounds(node.bounds, {
        padding: node.fitPadding,
        maxZoom: node.fitMaxZoom,
      });
      if (!camera || typeof camera.zoom !== "number") {
        return null;
      }
      return camera.zoom;
    };

    const populateFocusThresholdsForChain = (nodeId: string | null) => {
      const chain = getFocusChain(nodeId);
      for (const chainNode of chain) {
        const zoom = computeFitZoom(chainNode);
        if (zoom != null) {
          focusZoomByNodeIdRef.current.set(chainNode.id, zoom);
        }
      }
    };

    const focusNodeByIdWithFit = (nodeId: string, updateHash: boolean, duration = 700) => {
      const node = focusNodeById.get(nodeId);
      if (!node) {
        return;
      }

      populateFocusThresholdsForChain(node.id);
      setFocusState(node.id, updateHash);

      runProgrammaticCamera(() => {
        normalMap.fitBounds(node.bounds, {
          padding: node.fitPadding,
          duration,
          maxZoom: node.fitMaxZoom,
        });
      }, duration + 120, () => {
        focusZoomByNodeIdRef.current.set(node.id, normalMap.getZoom());
      });
    };

    const applyFocusFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
      if (!hash) {
        setFocusState(null, false);
        return;
      }
      const nodeId = resolveHashToFocusNode(hash);
      if (!nodeId) {
        setFocusState(null, false);
        return;
      }
      focusNodeByIdWithFit(nodeId, false, 650);
    };

    const onNormalMapReady = () => {
      addVectorLayers(normalMap, waypoints, false);
      addFranceSubregionLayers(normalMap, WINE_SUBREGIONS_DATA);
      addBurgundyDetailLayers(normalMap);
      normalMap.on("click", "regions-hit-fill", onRegionClick);
      normalMap.on("click", "france-subregions-hit-fill", onSubregionClick);
      normalMap.on("click", "burgundy-detail-subregions-hit-fill", onBurgundyDetailClick);
      normalMap.on("mouseenter", "regions-hit-fill", onRegionMouseEnter);
      normalMap.on("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      applyFocusFromHash();
      setWaypointVisibility(activeFocusNodeIdRef.current);
      renderMask();
      setDebugSnapshot();
    };
    const onProcessedMapReady = () => {
      addVectorLayers(processedMap, waypoints, false);
    };
    const onPoiMapReady = () => {
      addVectorLayers(poiMap, waypoints, true);
      setWaypointVisibility(activeFocusNodeIdRef.current);
    };

    const onRegionClick = (event: maplibregl.MapLayerMouseEvent) => {
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
      if (!clicked) {
        return;
      }
      const key = clickedFeatureKey(clicked as GeoJSON.Feature);
      const nodeId = regionNodeIdByKey.get(key);
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 850);
    };
    const onSubregionClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (!activeRegionKeyRef.current) {
        return;
      }
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
      if (!clicked) {
        return;
      }
      const props = (clicked.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      const parentIso = typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : "";
      if (parentIso !== activeRegionKeyRef.current) {
        return;
      }
      const nodeId = subregionNodeIdBySlug.get(slug);
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 700);
    };
    const onBurgundyDetailClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (!activeSubregionSlugRef.current) {
        return;
      }
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
      if (!clicked) {
        return;
      }
      const props = (clicked.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : "";
      if (parentSlug !== activeSubregionSlugRef.current) {
        return;
      }
      const nodeId = detailNodeIdBySlug.get(slug);
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 650);
    };
    const onRegionMouseEnter = () => {
      normalMap.getCanvas().style.cursor = "pointer";
    };
    const onRegionMouseLeave = () => {
      normalMap.getCanvas().style.cursor = "";
    };
    const onZoomStart = () => {
      if (isProgrammaticCameraRef.current) {
        return;
      }
      zoomGestureStartRef.current = normalMap.getZoom();
    };
    const onZoomEnd = () => {
      if (isProgrammaticCameraRef.current) {
        return;
      }
      const startZoom = zoomGestureStartRef.current;
      zoomGestureStartRef.current = null;
      if (startZoom == null) {
        return;
      }
      const endZoom = normalMap.getZoom();
      if (endZoom >= startZoom - 0.01) {
        return;
      }
      const focusedNodeId = activeFocusNodeIdRef.current;
      if (!focusedNodeId) {
        return;
      }
      const focusedNode = focusNodeById.get(focusedNodeId);
      if (!focusedNode) {
        return;
      }
      const threshold = focusZoomByNodeIdRef.current.get(focusedNode.id);
      if (threshold == null || endZoom >= threshold - UNFOCUS_ZOOM_LEEWAY) {
        return;
      }
      const parentId = focusedNode.parentId;
      if (!parentId) {
        setFocusState(null, true);
        return;
      }
      populateFocusThresholdsForChain(parentId);
      setFocusState(parentId, true);
    };

    const onMove = () => {
      setDebugSnapshot();
      setWaypointVisibility(activeFocusNodeIdRef.current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setFocusState(null, true);
      runProgrammaticCamera(() => {
        normalMap.easeTo({
          center: INITIAL_CENTER as LngLatLike,
          zoom: INITIAL_ZOOM,
          duration: 650,
        });
      }, 820);
    };

    processedMap.on("load", onProcessedMapReady);
    normalMap.on("load", onNormalMapReady);
    poiMap.on("load", onPoiMapReady);
    normalMap.on("move", syncMirrorMaps);
    normalMap.on("move", onMove);
    normalMap.on("zoomstart", onZoomStart);
    normalMap.on("zoomend", onZoomEnd);
    normalMap.on("render", renderMask);
    normalMap.on("resize", renderMask);
    window.addEventListener("hashchange", applyFocusFromHash);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", renderMask);

    createMaskProgram();

    return () => {
      window.removeEventListener("resize", renderMask);
      window.removeEventListener("hashchange", applyFocusFromHash);
      window.removeEventListener("keydown", onKeyDown);

      normalMap.off("load", onNormalMapReady);
      processedMap.off("load", onProcessedMapReady);
      poiMap.off("load", onPoiMapReady);
      if (normalMap.getLayer("regions-hit-fill")) {
        normalMap.off("click", "regions-hit-fill", onRegionClick);
        normalMap.off("click", "france-subregions-hit-fill", onSubregionClick);
        normalMap.off("click", "burgundy-detail-subregions-hit-fill", onBurgundyDetailClick);
        normalMap.off("mouseenter", "regions-hit-fill", onRegionMouseEnter);
        normalMap.off("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      }
      normalMap.off("move", syncMirrorMaps);
      normalMap.off("move", onMove);
      normalMap.off("zoomstart", onZoomStart);
      normalMap.off("zoomend", onZoomEnd);
      normalMap.off("render", renderMask);
      normalMap.off("resize", renderMask);

      normalMap.remove();
      processedMap.remove();
      poiMap.remove();
      normalMapRef.current = null;
      processedMapRef.current = null;
      poiMapRef.current = null;

      if (gl && positionBuffer) {
        gl.deleteBuffer(positionBuffer);
      }
      if (gl && glProgram) {
        gl.deleteProgram(glProgram);
      }
      normalContainer.style.maskImage = "none";
      normalContainer.style.webkitMaskImage = "none";
    };
  }, [
    burgundyDetailPolygonsBySlug,
    detailNodeIdBySlug,
    focusChildrenByParentId,
    focusNodeById,
    regionPolygons,
    regionPolygonsByKey,
    regionNodeIdByKey,
    subregionBounds,
    subregionNodeIdBySlug,
    subregionPolygonsBySlug,
    waypoints,
  ]);

  return (
    <div className="app-shell">
      <div className="map-stack">
        <div ref={processedMapContainerRef} className="map map-processed" />
        <div ref={normalMapContainerRef} className="map map-normal" />
        <div ref={poiMapContainerRef} className="map map-poi" />
        <canvas ref={maskCanvasRef} className="mask-canvas" aria-hidden="true" />
      </div>

      <div className="hud">
        <div className="debug-item">
          <span>Zoom:</span>
          <strong>{debug.zoom.toFixed(2)}</strong>
        </div>
        <div className="debug-item">
          <span>Center:</span>
          <strong>
            {debug.centerLon.toFixed(4)}, {debug.centerLat.toFixed(4)}
          </strong>
        </div>
        <div className="debug-item">
          <span>Tile source:</span>
          <strong>{debug.source}</strong>
        </div>
        <div className="debug-item">
          <span>Focused:</span>
          <strong>{activeRegionKey ? regionLabelByKey.get(activeRegionKey) ?? activeRegionKey : "None"}</strong>
        </div>
        <div className="debug-item">
          <span>Sub focus:</span>
          <strong>{activeSubregionSlug ?? "None"}</strong>
        </div>
        <div className="debug-item">
          <span>Detail focus:</span>
          <strong>{activeDetailSlug ?? "None"}</strong>
        </div>
        <div className="debug-item muted">
          <span>
            Local thresholds z{Z_HI}/z{Z_SUBREGION_MID}/z{Z_SUBREGION_HI} (base={Z_BASE}, +{HI_Z_DELTA}, +{SUBREGION_MID_Z_DELTA}, +{SUBREGION_HI_Z_DELTA})
          </span>
        </div>
      </div>

      <div className="attribution-chip">
        <a href="https://gibs.earthdata.nasa.gov/" target="_blank" rel="noreferrer">
          Imagery: NASA GIBS
        </a>
        <span>|</span>
        <a href="https://maplibre.org/" target="_blank" rel="noreferrer">
          MapLibre
        </a>
      </div>
    </div>
  );
}
