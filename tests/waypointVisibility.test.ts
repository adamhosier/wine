import { describe, expect, it } from "vitest";
import type { FocusNode } from "../src/lib/focus";
import { computeWaypointLayerState } from "../src/lib/waypointVisibility";

function node(id: string): FocusNode {
  return {
    id,
    slug: id,
    parentId: null,
    depth: 0,
    kind: "region",
    regionKey: "FRA",
    subregionSlug: null,
    detailSlug: null,
    bounds: [[0, 0], [1, 1]],
    fitPadding: { top: 1, right: 1, bottom: 1, left: 1 },
    fitMaxZoom: 6,
  };
}

describe("waypoint visibility", () => {
  it("shows global subregion waypoints when unfocused and zoomed out", () => {
    const state = computeWaypointLayerState(null, 4, 4.6);
    expect(state.visibility).toBe("visible");
    expect(state.filter).toEqual(["==", ["get", "waypoint_depth"], 1]);
    expect(state.signature).toBe("visible::global");
  });

  it("shows only child waypoints for focused node", () => {
    const state = computeWaypointLayerState(node("region:FRA"), 10, 4.6);
    expect(state.visibility).toBe("visible");
    expect(state.filter).toEqual(["==", ["get", "parent_node_id"], "region:FRA"]);
    expect(state.signature).toBe("visible::children:region:FRA");
  });

  it("hides waypoints when unfocused and zoomed in", () => {
    const state = computeWaypointLayerState(null, 7, 4.6);
    expect(state.visibility).toBe("none");
    expect(state.filter).toBeNull();
    expect(state.signature).toBe("none::none");
  });
});
