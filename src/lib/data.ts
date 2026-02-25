import regionsGeoJsonUrl from "../data/regions.geojson?url";
import wineSubregionsGeoJsonUrl from "../data/france-wine-subregions.geojson?url";
import wineDetailGeoJsonUrl from "../data/burgundy-detail-subregions.geojson?url";
import waypointGeoJsonUrl from "../data/burgundy-waypoints.geojson?url";
import { Z_SUBREGION_HI } from "../config";
import { clickedFeatureKey, regionSlug } from "./geo";
import { buildRegionTreeNodes, type RegionTreeNode } from "./regionTree";

type PolygonOrMulti = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export type RegionsFeatureCollection = GeoJSON.FeatureCollection<PolygonOrMulti>;
export type HierarchyNodesFeatureCollection = GeoJSON.FeatureCollection<PolygonOrMulti>;
export type WaypointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;

export type RuntimeDataSourceId = "wset-level-2" | "depth-demo-uk";

export type RuntimeDataSourceOption = {
  id: RuntimeDataSourceId;
  label: string;
  description: string;
};

export const RUNTIME_DATA_SOURCES: RuntimeDataSourceOption[] = [
  {
    id: "wset-level-2",
    label: "WSET Level 2",
    description: "Full configured wine-region hierarchy.",
  },
  {
    id: "depth-demo-uk",
    label: "Depth Demo (UK)",
    description: "5-level hierarchy: UK > England > London > Hackney > Clissold Park.",
  },
];

export type RuntimeData = {
  sourceId: RuntimeDataSourceId;
  sourceLabel: string;
  regions: RegionsFeatureCollection;
  hierarchyNodes: HierarchyNodesFeatureCollection;
  explicitWaypoints: WaypointFeatureCollection;
  treeNodes: RegionTreeNode[];
};

async function fetchGeoJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch data asset: ${url} (${response.status})`);
  }
  return (await response.json()) as T;
}

function sourceLabelFor(sourceId: RuntimeDataSourceId): string {
  return RUNTIME_DATA_SOURCES.find((source) => source.id === sourceId)?.label ?? sourceId;
}

function normalizeRootRegions(regions: RegionsFeatureCollection): RegionsFeatureCollection {
  return {
    type: "FeatureCollection",
    features: regions.features.map((feature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      const slug = regionSlug(feature as GeoJSON.Feature);
      return {
        ...feature,
        properties: {
          ...props,
          node_id: `region:${key}`,
          slug,
        },
      };
    }),
  };
}

function normalizeHierarchyNodes(
  subregions: HierarchyNodesFeatureCollection,
  details: HierarchyNodesFeatureCollection,
): HierarchyNodesFeatureCollection {
  const subregionSlugs = new Set<string>();
  const features: GeoJSON.Feature<PolygonOrMulti>[] = [];

  for (const feature of subregions.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const slug = typeof props.slug === "string" ? props.slug : "";
    const parentIso = typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : "";
    if (!slug || !parentIso) {
      continue;
    }
    subregionSlugs.add(slug);
    features.push({
      ...feature,
      properties: {
        ...props,
        node_id: `subregion:${slug}`,
        parent_node_id: `region:${parentIso}`,
        node_depth: 1,
      },
    });
  }

  for (const feature of details.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const slug = typeof props.slug === "string" ? props.slug : "";
    const explicitParentNodeId = typeof props.parent_node_id === "string" ? props.parent_node_id : "";
    const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : "";
    if (!slug) {
      continue;
    }
    const parentNodeId =
      explicitParentNodeId ||
      (parentSlug ? (subregionSlugs.has(parentSlug) ? `subregion:${parentSlug}` : `detail:${parentSlug}`) : "");
    if (!parentNodeId) {
      continue;
    }
    features.push({
      ...feature,
      properties: {
        ...props,
        node_id: `detail:${slug}`,
        parent_node_id: parentNodeId,
        node_depth: 2,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function box(minLon: number, minLat: number, maxLon: number, maxLat: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
}

function createUkDepthDemoData(): RuntimeData {
  const regions: RegionsFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "GBR",
        properties: {
          name: "UK",
          iso_a3: "GBR",
          node_id: "region:GBR",
          slug: "uk",
        },
        geometry: box(-8.9, 49.8, 2.2, 59.2),
      },
    ],
  };

  const hierarchyNodes: HierarchyNodesFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "england",
        properties: {
          name: "England",
          slug: "england",
          node_id: "subregion:england",
          parent_node_id: "region:GBR",
          node_depth: 1,
        },
        geometry: box(-6.4, 50.0, 1.9, 55.9),
      },
      {
        type: "Feature",
        id: "london",
        properties: {
          name: "London",
          slug: "london",
          node_id: "detail:london",
          parent_node_id: "subregion:england",
          node_depth: 2,
        },
        geometry: box(-0.55, 51.27, 0.34, 51.70),
      },
      {
        type: "Feature",
        id: "hackney",
        properties: {
          name: "Hackney",
          slug: "hackney",
          node_id: "detail:hackney",
          parent_node_id: "detail:london",
          node_depth: 3,
        },
        geometry: box(-0.121, 51.527, -0.010, 51.584),
      },
      {
        type: "Feature",
        id: "clissold-park",
        properties: {
          name: "Clissold Park",
          slug: "clissold-park",
          node_id: "detail:clissold-park",
          parent_node_id: "detail:hackney",
          node_depth: 4,
        },
        geometry: box(-0.1035, 51.5588, -0.0787, 51.5716),
      },
    ],
  };

  const explicitWaypoints: WaypointFeatureCollection = {
    type: "FeatureCollection",
    features: [],
  };

  return {
    sourceId: "depth-demo-uk",
    sourceLabel: sourceLabelFor("depth-demo-uk"),
    regions,
    hierarchyNodes,
    explicitWaypoints,
    treeNodes: buildRegionTreeNodes(regions, hierarchyNodes, Z_SUBREGION_HI),
  };
}

export async function loadRuntimeData(sourceId: RuntimeDataSourceId = "wset-level-2"): Promise<RuntimeData> {
  if (sourceId === "depth-demo-uk") {
    return createUkDepthDemoData();
  }

  const [regionsRaw, subregions, details, explicitWaypoints] = await Promise.all([
    fetchGeoJson<RegionsFeatureCollection>(regionsGeoJsonUrl),
    fetchGeoJson<HierarchyNodesFeatureCollection>(wineSubregionsGeoJsonUrl),
    fetchGeoJson<HierarchyNodesFeatureCollection>(wineDetailGeoJsonUrl),
    fetchGeoJson<WaypointFeatureCollection>(waypointGeoJsonUrl),
  ]);

  const regions = normalizeRootRegions(regionsRaw);
  const hierarchyNodes = normalizeHierarchyNodes(subregions, details);

  return {
    sourceId,
    sourceLabel: sourceLabelFor(sourceId),
    regions,
    hierarchyNodes,
    explicitWaypoints,
    treeNodes: buildRegionTreeNodes(regions, hierarchyNodes, Z_SUBREGION_HI),
  };
}
