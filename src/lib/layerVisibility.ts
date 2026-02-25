import type maplibregl from "maplibre-gl";

export function applyOutlineFocusFilter(
  maps: Array<maplibregl.Map | null | undefined>,
  focusedRootNodeId: string | null,
) {
  const outlineFilter: maplibregl.FilterSpecification | null = focusedRootNodeId
    ? (["==", ["get", "node_id"], focusedRootNodeId] as maplibregl.FilterSpecification)
    : null;
  for (const map of maps) {
    if (map?.getLayer("regions-outline")) {
      map.setFilter("regions-outline", outlineFilter);
    }
  }
}

export function hasChildren(
  nodeId: string | null,
  focusChildrenByParentId: Map<string, string[]>,
): boolean {
  if (!nodeId) {
    return false;
  }
  return (focusChildrenByParentId.get(nodeId) ?? []).length > 0;
}

export function applyHierarchyChildrenVisibility(
  map: maplibregl.Map | null,
  focusedNodeId: string | null,
  visible: boolean,
) {
  if (!map) {
    return;
  }
  const visibility = focusedNodeId && visible ? "visible" : "none";
  const filter: maplibregl.FilterSpecification | null =
    focusedNodeId && visible
      ? (["==", ["get", "parent_node_id"], focusedNodeId] as maplibregl.FilterSpecification)
      : null;

  for (const layerId of ["hierarchy-nodes-line", "hierarchy-nodes-hit-fill"]) {
    if (!map.getLayer(layerId)) {
      continue;
    }
    map.setLayoutProperty(layerId, "visibility", visibility);
    map.setFilter(layerId, filter);
  }
}
