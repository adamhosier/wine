import { featureBounds, clickedFeatureKey, longestPrefixMatch, regionSlug } from "./geo";

export type FocusNode = {
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

export type FocusGraph = {
  focusNodeById: Map<string, FocusNode>;
  focusChildrenByParentId: Map<string, string[]>;
  regionNodeIdByKey: Map<string, string>;
  subregionNodeIdBySlug: Map<string, string>;
  detailNodeIdBySlug: Map<string, string>;
};

type FocusLevelSpec = {
  prefix: string;
  depth: number;
  kind: FocusNode["kind"];
  source: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  getNodeKey: (feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>) => string | null;
  getSlug: (feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>) => string | null;
  getParentNodeId: (
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    idsByLevel: Map<string, Map<string, string>>,
  ) => string | null;
  buildNodeContext: (
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    parent: FocusNode | null,
  ) => Pick<FocusNode, "regionKey" | "subregionSlug" | "detailSlug">;
  fitPadding: { top: number; right: number; bottom: number; left: number };
  fitMaxZoom: number;
};

function buildFocusGraphFromLevels(levels: FocusLevelSpec[]): FocusGraph {
  const nodes = new Map<string, FocusNode>();
  const children = new Map<string, string[]>();
  const idsByLevel = new Map<string, Map<string, string>>();
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

  for (const level of levels) {
    const levelIds = new Map<string, string>();
    for (const rawFeature of level.source.features) {
      const feature = rawFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      const key = level.getNodeKey(feature);
      const slug = level.getSlug(feature);
      const bounds = featureBounds(feature.geometry);
      if (!key || !slug || !bounds) {
        continue;
      }
      const parentId = level.getParentNodeId(feature, idsByLevel);
      if (level.depth > 0 && !parentId) {
        continue;
      }
      const parentNode = parentId ? nodes.get(parentId) ?? null : null;
      const id = `${level.prefix}:${key}`;
      const context = level.buildNodeContext(feature, parentNode);
      const node: FocusNode = {
        id,
        slug,
        parentId,
        depth: level.depth,
        kind: level.kind,
        regionKey: context.regionKey ?? null,
        subregionSlug: context.subregionSlug ?? null,
        detailSlug: context.detailSlug ?? null,
        bounds,
        fitPadding: level.fitPadding,
        fitMaxZoom: level.fitMaxZoom,
      };
      nodes.set(id, node);
      levelIds.set(key, id);
      addChild(parentId, id);
    }
    idsByLevel.set(level.prefix, levelIds);

    if (level.prefix === "region") {
      for (const [key, id] of levelIds) {
        regionIds.set(key, id);
      }
    }
    if (level.prefix === "subregion") {
      for (const [key, id] of levelIds) {
        subregionIds.set(key, id);
      }
    }
    if (level.prefix === "detail") {
      for (const [key, id] of levelIds) {
        detailIds.set(key, id);
      }
    }
  }

  return {
    focusNodeById: nodes,
    focusChildrenByParentId: children,
    regionNodeIdByKey: regionIds,
    subregionNodeIdBySlug: subregionIds,
    detailNodeIdBySlug: detailIds,
  };
}

export function buildFocusGraph(
  regions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  subregions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  details: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  zSubregionHi: number,
): FocusGraph {
  return buildFocusGraphFromLevels([
    {
      prefix: "region",
      depth: 0,
      kind: "region",
      source: regions,
      getNodeKey: (feature) => clickedFeatureKey(feature as GeoJSON.Feature),
      getSlug: (feature) => regionSlug(feature as GeoJSON.Feature),
      getParentNodeId: () => null,
      buildNodeContext: (feature) => {
        const regionKey = clickedFeatureKey(feature as GeoJSON.Feature);
        return {
          regionKey,
          subregionSlug: null,
          detailSlug: null,
        };
      },
      fitPadding: { top: 56, right: 56, bottom: 56, left: 56 },
      fitMaxZoom: 6.2,
    },
    {
      prefix: "subregion",
      depth: 1,
      kind: "subregion",
      source: subregions,
      getNodeKey: (feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        return typeof props.slug === "string" ? props.slug : null;
      },
      getSlug: (feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        return typeof props.slug === "string" ? props.slug : null;
      },
      getParentNodeId: (feature, idsByLevel) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const parentIso = typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : "";
        return idsByLevel.get("region")?.get(parentIso) ?? null;
      },
      buildNodeContext: (feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        return {
          regionKey: typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : null,
          subregionSlug: typeof props.slug === "string" ? props.slug : null,
          detailSlug: null,
        };
      },
      fitPadding: { top: 48, right: 48, bottom: 48, left: 48 },
      fitMaxZoom: Math.max(7.4, zSubregionHi - 1.2),
    },
    {
      prefix: "detail",
      depth: 2,
      kind: "detail",
      source: details,
      getNodeKey: (feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        return typeof props.slug === "string" ? props.slug : null;
      },
      getSlug: (feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        return typeof props.slug === "string" ? props.slug : null;
      },
      getParentNodeId: (feature, idsByLevel) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : "";
        return idsByLevel.get("subregion")?.get(parentSlug) ?? null;
      },
      buildNodeContext: (feature, parent) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        return {
          regionKey: parent?.regionKey ?? null,
          subregionSlug: parent?.subregionSlug ?? null,
          detailSlug: typeof props.slug === "string" ? props.slug : null,
        };
      },
      fitPadding: { top: 40, right: 40, bottom: 40, left: 40 },
      fitMaxZoom: Math.max(8.2, zSubregionHi + 0.2),
    },
  ]);
}

export function getFocusChain(nodeId: string | null, focusNodeById: Map<string, FocusNode>): FocusNode[] {
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
}

export function resolveHashToFocusNode(
  hash: string,
  focusChildrenByParentId: Map<string, string[]>,
  focusNodeById: Map<string, FocusNode>,
): string | null {
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
}

export function hashForFocus(nodeId: string | null, focusNodeById: Map<string, FocusNode>): string {
  const parts = getFocusChain(nodeId, focusNodeById).map((node) => node.slug);
  return parts.length ? `#${parts.join("-")}` : "";
}
