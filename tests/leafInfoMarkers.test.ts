import { describe, expect, it } from "vitest";
import { selectVisibleLeafInfoFeatures } from "../src/lib/leafInfoMarkers";
import type { WaypointFeatureCollection } from "../src/lib/waypoints";

const points: WaypointFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "detail:sancerre::leaf-info",
      properties: { node_id: "detail:sancerre", parent_node_id: "subregion:loire", name: "Sancerre", grape_lines: ["Sauvignon Blanc: 85%"] },
      geometry: { type: "Point", coordinates: [2, 2] },
    },
    {
      type: "Feature",
      id: "detail:vouvray::leaf-info",
      properties: { node_id: "detail:vouvray", parent_node_id: "subregion:loire", name: "Vouvray", grape_lines: ["Chenin Blanc: 100%"] },
      geometry: { type: "Point", coordinates: [3, 3] },
    },
  ],
};

describe("leaf info markers", () => {
  it("returns empty list when unfocused", () => {
    const features = selectVisibleLeafInfoFeatures(null, new Set(["detail:sancerre"]), points);
    expect(features).toHaveLength(0);
  });

  it("returns focused leaf feature when focused on a leaf", () => {
    const features = selectVisibleLeafInfoFeatures("detail:sancerre", new Set(["detail:sancerre"]), points);
    expect(features).toHaveLength(1);
    expect(features[0].properties?.node_id).toBe("detail:sancerre");
  });

  it("returns children when focused on a parent", () => {
    const features = selectVisibleLeafInfoFeatures("subregion:loire", new Set(["detail:sancerre"]), points);
    expect(features).toHaveLength(2);
  });
});
