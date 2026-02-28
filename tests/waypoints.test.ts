import { describe, expect, it } from "vitest";
import {
  buildLeafInfoPoints,
  buildExplicitWaypoints,
  buildHierarchyWaypoints,
  mergeWaypoints,
  type HierarchyNodesFeatureCollection,
  type WaypointFeatureCollection,
} from "../src/lib/waypoints";

function square(minX: number, minY: number, maxX: number, maxY: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
  };
}

describe("waypoint builders", () => {
  it("builds deduplicated hierarchy waypoints", () => {
    const data: HierarchyNodesFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "subregion:england",
          properties: {
            node_id: "subregion:england",
            parent_node_id: "region:GBR",
            node_depth: 1,
            slug: "england",
            name: "England",
          },
          geometry: square(0, 0, 2, 2),
        },
        {
          type: "Feature",
          id: "subregion:england",
          properties: {
            node_id: "subregion:england",
            parent_node_id: "region:GBR",
            node_depth: 1,
            slug: "england",
            name: "Duplicate England",
          },
          geometry: square(0, 0, 1, 1),
        },
      ],
    };

    const out = buildHierarchyWaypoints([data]);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties?.parent_node_id).toBe("region:GBR");
    expect(out.features[0].properties?.waypoint_depth).toBe(1);
    expect((out.features[0].geometry as GeoJSON.Point).coordinates).toEqual([1, 1]);
  });

  it("preserves explicit waypoints and normalizes parent metadata", () => {
    const explicit: WaypointFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "clissold",
          properties: { name: "Clissold", parent_slug: "hackney" },
          geometry: { type: "Point", coordinates: [4, 5] },
        },
      ],
    };

    const out = buildExplicitWaypoints([explicit]);
    expect(out.features[0].properties?.parent_node_id).toBe("subregion:hackney");
    expect(out.features[0].properties?.waypoint_depth).toBe(2);
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

  it("builds leaf info points from annotated leaf features", () => {
    const data: HierarchyNodesFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "detail:sancerre",
          properties: {
            node_id: "detail:sancerre",
            parent_node_id: "subregion:loire",
            name: "Sancerre",
            leaf_is_leaf: true,
            leaf_grapes_text: "Sauvignon Blanc 85%, Pinot Noir 15%",
            leaf_grape_breakdown: [
              { grape: "Sauvignon Blanc", pct: 85 },
              { grape: "Pinot Noir", pct: 15 },
            ],
          },
          geometry: square(1, 1, 3, 3),
        },
      ],
    };
    const points = buildLeafInfoPoints([data]);
    expect(points.features).toHaveLength(1);
    expect(points.features[0].properties?.node_id).toBe("detail:sancerre");
    expect(points.features[0].properties?.grape_text).toBe("Sauvignon Blanc 85%, Pinot Noir 15%");
    expect(points.features[0].properties?.grape_lines).toEqual([
      "Sauvignon Blanc: 85%",
      "Pinot Noir: 15%",
    ]);
    expect((points.features[0].geometry as GeoJSON.Point).coordinates).toEqual([2, 2]);
  });
});
