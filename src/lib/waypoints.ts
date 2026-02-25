import { geometryBoundsCenter } from "./geo";

export type SubregionsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
export type WaypointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;
export type DetailFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export function buildSubregionWaypoints(collections: SubregionsFeatureCollection[]): WaypointFeatureCollection {
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
      const dedupeKey = `${String(props.parent_iso_a3 ?? "")}:${slug}`;
      if (slug && seen.has(dedupeKey)) {
        continue;
      }
      if (slug) {
        seen.add(dedupeKey);
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

export function buildDetailWaypoints(collections: DetailFeatureCollection[]): WaypointFeatureCollection {
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
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : null;
      const dedupeKey = `${parentSlug ?? ""}:${slug}`;
      if (slug && seen.has(dedupeKey)) {
        continue;
      }
      if (slug) {
        seen.add(dedupeKey);
      }
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

export function buildExplicitWaypoints(collections: WaypointFeatureCollection[]): WaypointFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const collection of collections) {
    for (const waypoint of collection.features) {
      const props = (waypoint.properties ?? {}) as Record<string, unknown>;
      const parentNodeId = typeof props.parent_node_id === "string" ? props.parent_node_id : null;
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : null;
      features.push({
        type: "Feature",
        id: waypoint.id,
        properties: {
          ...props,
          parent_slug: parentSlug,
          parent_node_id: parentNodeId ?? (parentSlug ? `subregion:${parentSlug}` : null),
          waypoint_level: typeof props.waypoint_level === "string" ? props.waypoint_level : "detail",
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
