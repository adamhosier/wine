import { describe, expect, it } from "vitest";
import {
  buildDetailWaypoints,
  buildExplicitWaypoints,
  buildSubregionWaypoints,
  mergeWaypoints,
  type DetailFeatureCollection,
  type SubregionsFeatureCollection,
  type WaypointFeatureCollection,
} from "../src/lib/waypoints";

function square(minX: number, minY: number, maxX: number, maxY: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
  };
}

describe("waypoint builders", () => {
  it("builds deduplicated subregion waypoints", () => {
    const data: SubregionsFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "napa",
          properties: { slug: "napa", name: "Napa", parent_iso_a3: "CAL" },
          geometry: square(0, 0, 2, 2),
        },
        {
          type: "Feature",
          id: "napa",
          properties: { slug: "napa", name: "Duplicate Napa", parent_iso_a3: "CAL" },
          geometry: square(0, 0, 1, 1),
        },
      ],
    };

    const out = buildSubregionWaypoints([data]);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties?.parent_node_id).toBe("region:CAL");
    expect((out.features[0].geometry as GeoJSON.Point).coordinates).toEqual([1, 1]);
  });

  it("builds deduplicated detail waypoints with parent node id", () => {
    const data: DetailFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "rutherford",
          properties: { slug: "rutherford", parent_slug: "napa", name: "Rutherford" },
          geometry: square(2, 2, 4, 4),
        },
      ],
    };

    const out = buildDetailWaypoints([data]);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties?.parent_node_id).toBe("subregion:napa");
    expect((out.features[0].geometry as GeoJSON.Point).coordinates).toEqual([3, 3]);
  });

  it("preserves explicit waypoints and normalizes parent metadata", () => {
    const explicit: WaypointFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "beaune",
          properties: { name: "Beaune", parent_slug: "burgundy" },
          geometry: { type: "Point", coordinates: [4, 5] },
        },
      ],
    };

    const out = buildExplicitWaypoints([explicit]);
    expect(out.features[0].properties?.parent_node_id).toBe("subregion:burgundy");
    expect(out.features[0].properties?.waypoint_level).toBe("detail");
  });

  it("merges waypoint collections", () => {
    const a: WaypointFeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }],
    };
    const b: WaypointFeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} }],
    };
    const merged = mergeWaypoints([a, b]);
    expect(merged.features).toHaveLength(2);
  });
});

