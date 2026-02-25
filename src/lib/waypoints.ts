import { geometryBoundsCenter } from "./geo";

export type HierarchyNodesFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
export type WaypointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;

export function buildHierarchyWaypoints(collections: HierarchyNodesFeatureCollection[]): WaypointFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const nodeFeature of collection.features) {
      const center = geometryBoundsCenter(nodeFeature.geometry);
      if (!center) {
        continue;
      }
      const props = (nodeFeature.properties ?? {}) as Record<string, unknown>;
      const nodeId = typeof props.node_id === "string" ? props.node_id : "";
      if (!nodeId || seen.has(nodeId)) {
        continue;
      }
      seen.add(nodeId);

      const name =
        (typeof props.name === "string" && props.name) ||
        (typeof props.slug === "string" && props.slug) ||
        nodeId;
      const slug = typeof props.slug === "string" ? props.slug : null;
      const parentNodeId = typeof props.parent_node_id === "string" ? props.parent_node_id : null;
      const nodeDepth = typeof props.node_depth === "number" ? props.node_depth : 1;

      features.push({
        type: "Feature",
        id: nodeId,
        properties: {
          name,
          slug,
          node_id: nodeId,
          parent_node_id: parentNodeId,
          waypoint_depth: nodeDepth,
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

export function buildExplicitWaypoints(collections: WaypointFeatureCollection[]): WaypointFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const collection of collections) {
    for (const waypoint of collection.features) {
      const props = (waypoint.properties ?? {}) as Record<string, unknown>;
      const nodeId = typeof props.node_id === "string" ? props.node_id : null;
      const parentNodeId = typeof props.parent_node_id === "string" ? props.parent_node_id : null;
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : null;
      features.push({
        type: "Feature",
        id: waypoint.id ?? nodeId ?? undefined,
        properties: {
          ...props,
          node_id: nodeId,
          parent_slug: parentSlug,
          parent_node_id: parentNodeId ?? (parentSlug ? `subregion:${parentSlug}` : null),
          waypoint_depth: typeof props.waypoint_depth === "number" ? props.waypoint_depth : 2,
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

export function mergeWaypoints(collections: WaypointFeatureCollection[]): WaypointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((collection) => collection.features),
  };
}
