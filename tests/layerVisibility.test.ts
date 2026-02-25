import { describe, expect, it } from "vitest";
import { hasChildren } from "../src/lib/layerVisibility";

describe("layer visibility helpers", () => {
  it("detects whether a focused node has children", () => {
    const focusChildrenByParentId = new Map<string, string[]>([
      ["region:GBR", ["subregion:england"]],
      ["subregion:england", ["detail:london"]],
    ]);

    expect(hasChildren("region:GBR", focusChildrenByParentId)).toBe(true);
    expect(hasChildren("subregion:england", focusChildrenByParentId)).toBe(true);
    expect(hasChildren("detail:london", focusChildrenByParentId)).toBe(false);
    expect(hasChildren(null, focusChildrenByParentId)).toBe(false);
  });
});
