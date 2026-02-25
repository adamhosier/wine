import type maplibregl from "maplibre-gl";
import type { FocusNode } from "./focus";

export function applyOutlineFocusFilter(
  maps: Array<maplibregl.Map | null | undefined>,
  regionKey: string | null,
) {
  const outlineFilter: maplibregl.FilterSpecification | null = regionKey
    ? (["==", ["get", "iso_a3"], regionKey] as maplibregl.FilterSpecification)
    : null;
  for (const map of maps) {
    if (map?.getLayer("regions-outline")) {
      map.setFilter("regions-outline", outlineFilter);
    }
  }
}

export function applySubregionVisibility(map: maplibregl.Map | null, regionKey: string | null) {
  if (!map) {
    return;
  }
  const visibility = regionKey ? "visible" : "none";
  const filter: maplibregl.FilterSpecification | null = regionKey
    ? (["==", ["get", "parent_iso_a3"], regionKey] as maplibregl.FilterSpecification)
    : null;

  if (map.getLayer("france-subregions-line")) {
    map.setLayoutProperty("france-subregions-line", "visibility", visibility);
    map.setFilter("france-subregions-line", filter);
  }
  if (map.getLayer("france-subregions-hit-fill")) {
    map.setLayoutProperty("france-subregions-hit-fill", "visibility", visibility);
    map.setFilter("france-subregions-hit-fill", filter);
  }
}

export function hasDetailChildren(
  subregionSlug: string | null,
  subregionNodeIdBySlug: Map<string, string>,
  focusChildrenByParentId: Map<string, string[]>,
  focusNodeById: Map<string, FocusNode>,
): boolean {
  if (!subregionSlug) {
    return false;
  }
  const subregionNodeId = subregionNodeIdBySlug.get(subregionSlug) ?? null;
  if (!subregionNodeId) {
    return false;
  }
  return (focusChildrenByParentId.get(subregionNodeId) ?? []).some((childId) => {
    const child = focusNodeById.get(childId);
    return child?.kind === "detail";
  });
}

export function applyDetailVisibility(map: maplibregl.Map | null, subregionSlug: string | null, visible: boolean) {
  if (!map) {
    return;
  }
  const visibility = visible ? "visible" : "none";
  const filter: maplibregl.FilterSpecification | null = subregionSlug
    ? (["==", ["get", "parent_slug"], subregionSlug] as maplibregl.FilterSpecification)
    : null;
  const ids = ["burgundy-detail-subregions-hit-fill", "burgundy-detail-subregions-line"];

  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visibility);
      map.setFilter(id, filter);
    }
  }
}
