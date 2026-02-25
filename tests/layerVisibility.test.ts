import { describe, expect, it } from "vitest";
import type { FocusNode } from "../src/lib/focus";
import { hasDetailChildren } from "../src/lib/layerVisibility";

describe("layer visibility helpers", () => {
  it("detects whether a subregion has detail children", () => {
    const focusNodeById = new Map<string, FocusNode>([
      [
        "detail:a",
        {
          id: "detail:a",
          slug: "a",
          parentId: "subregion:burgundy",
          depth: 2,
          kind: "detail",
          regionKey: "FRA",
          subregionSlug: "burgundy",
          detailSlug: "a",
          bounds: [[0, 0], [1, 1]],
          fitPadding: { top: 1, right: 1, bottom: 1, left: 1 },
          fitMaxZoom: 8,
        },
      ],
    ]);
    const subregionNodeIdBySlug = new Map([["burgundy", "subregion:burgundy"]]);
    const focusChildrenByParentId = new Map([["subregion:burgundy", ["detail:a"]]]);

    expect(
      hasDetailChildren("burgundy", subregionNodeIdBySlug, focusChildrenByParentId, focusNodeById),
    ).toBe(true);
    expect(hasDetailChildren(null, subregionNodeIdBySlug, focusChildrenByParentId, focusNodeById)).toBe(
      false,
    );
    expect(
      hasDetailChildren("missing", subregionNodeIdBySlug, focusChildrenByParentId, focusNodeById),
    ).toBe(false);
  });
});
