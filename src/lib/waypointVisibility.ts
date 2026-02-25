import type maplibregl from "maplibre-gl";
import type { FocusNode } from "./focus";

export type WaypointLayerState = {
  visibility: "visible" | "none";
  filter: maplibregl.FilterSpecification | null;
  signature: string;
};

export function computeWaypointLayerState(
  focusNode: FocusNode | null,
  zoom: number,
  maxGlobalZoom: number,
): WaypointLayerState {
  const showGlobalSubregionWaypoints = !focusNode && zoom <= maxGlobalZoom;
  const showChildWaypoints = !!focusNode;
  const shouldShow = showGlobalSubregionWaypoints || showChildWaypoints;

  let filter: maplibregl.FilterSpecification | null = null;
  let filterKey = "none";
  if (showGlobalSubregionWaypoints) {
    filter = ["==", ["get", "waypoint_depth"], 1] as maplibregl.FilterSpecification;
    filterKey = "global";
  } else if (showChildWaypoints && focusNode) {
    filter = ["==", ["get", "parent_node_id"], focusNode.id] as maplibregl.FilterSpecification;
    filterKey = `children:${focusNode.id}`;
  }

  const visibility: "visible" | "none" = shouldShow ? "visible" : "none";
  return {
    visibility,
    filter,
    signature: `${visibility}::${filterKey}`,
  };
}

export function applyWaypointLayerState(map: maplibregl.Map | null, state: WaypointLayerState) {
  if (!map) {
    return;
  }
  if (map.getLayer("waypoints-circle")) {
    map.setLayoutProperty("waypoints-circle", "visibility", state.visibility);
    map.setFilter("waypoints-circle", state.filter);
  }
  if (map.getLayer("waypoints-label")) {
    map.setLayoutProperty("waypoints-label", "visibility", state.visibility);
    map.setFilter("waypoints-label", state.filter);
  }
}
