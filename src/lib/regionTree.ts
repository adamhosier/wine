import type { FocusNode } from "./focus";
import { clickedFeatureKey, featureBounds, regionSlug } from "./geo";

type PolygonOrMulti = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type PolygonCollection = GeoJSON.FeatureCollection<PolygonOrMulti>;

export type RegionTreeNode = FocusNode;

function depthKind(depth: number): FocusNode["kind"] {
  if (depth <= 0) {
    return "region";
  }
  if (depth === 1) {
    return "subregion";
  }
  return "detail";
}

function fitPaddingForDepth(depth: number): { top: number; right: number; bottom: number; left: number } {
  const base = Math.max(22, 56 - depth * 8);
  return { top: base, right: base, bottom: base, left: base };
}

function fitMaxZoomForDepth(depth: number, zSubregionHi: number): number {
  if (depth <= 0) {
    return 6.2;
  }
  const zoom = 6.2 + depth * 1.4;
  return Math.min(14.2, Math.max(zoom, zSubregionHi - 1.2 + depth * 0.2));
}

function nodeSlug(feature: GeoJSON.Feature<PolygonOrMulti>, fallback: string): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const fromProps = typeof props.slug === "string" ? props.slug : "";
  if (fromProps) {
    return fromProps;
  }
  const fromName = typeof props.name === "string" ? props.name : "";
  if (fromName) {
    return fromName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  return fallback;
}

export function buildRegionTreeNodes(
  regions: PolygonCollection,
  hierarchyNodes: PolygonCollection,
  zSubregionHi: number,
): RegionTreeNode[] {
  const nodes: RegionTreeNode[] = [];
  const nodesById = new Map<string, RegionTreeNode>();

  for (const feature of regions.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const regionKey = clickedFeatureKey(feature as GeoJSON.Feature);
    const id = typeof props.node_id === "string" ? props.node_id : `region:${regionKey}`;
    const slug = nodeSlug(feature, regionSlug(feature as GeoJSON.Feature));
    const bounds = featureBounds(feature.geometry);
    if (!id || !slug || !bounds) {
      continue;
    }
    const node: RegionTreeNode = {
      id,
      slug,
      parentId: null,
      depth: 0,
      kind: "region",
      regionKey,
      subregionSlug: null,
      detailSlug: null,
      bounds,
      fitPadding: fitPaddingForDepth(0),
      fitMaxZoom: fitMaxZoomForDepth(0, zSubregionHi),
    };
    nodes.push(node);
    nodesById.set(id, node);
  }

  const pending = [...hierarchyNodes.features];
  let remaining = pending;
  let pass = 0;

  while (remaining.length && pass < pending.length + 2) {
    pass += 1;
    let progressed = false;
    const next: typeof remaining = [];
    for (const feature of remaining) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const rawId = typeof props.node_id === "string" ? props.node_id : "";
      const rawParentId = typeof props.parent_node_id === "string" ? props.parent_node_id : "";
      if (!rawId || !rawParentId) {
        continue;
      }
      const parent = nodesById.get(rawParentId);
      if (!parent) {
        next.push(feature);
        continue;
      }
      const slug = nodeSlug(feature, rawId.split(":").slice(1).join("-"));
      const bounds = featureBounds(feature.geometry);
      if (!slug || !bounds) {
        continue;
      }
      const depth = parent.depth + 1;
      const node: RegionTreeNode = {
        id: rawId,
        slug,
        parentId: rawParentId,
        depth,
        kind: depthKind(depth),
        regionKey: parent.regionKey,
        subregionSlug: depth === 1 ? slug : parent.subregionSlug,
        detailSlug: depth >= 2 ? slug : null,
        bounds,
        fitPadding: fitPaddingForDepth(depth),
        fitMaxZoom: fitMaxZoomForDepth(depth, zSubregionHi),
      };
      nodes.push(node);
      nodesById.set(rawId, node);
      progressed = true;
    }
    if (!progressed) {
      break;
    }
    remaining = next;
  }

  return nodes;
}
