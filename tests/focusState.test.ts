import { describe, expect, it } from "vitest";
import type { FocusNode } from "../src/lib/focus";
import {
  deriveActiveFocusState,
  populateFocusThresholdsForChain,
  pruneFocusThresholds,
  shouldPopFocusOnZoomOut,
} from "../src/lib/focusState";

function node(partial: Partial<FocusNode> & Pick<FocusNode, "id" | "slug" | "bounds">): FocusNode {
  return {
    id: partial.id,
    slug: partial.slug,
    bounds: partial.bounds,
    parentId: partial.parentId ?? null,
    depth: partial.depth ?? 0,
    kind: partial.kind ?? "region",
    regionKey: partial.regionKey ?? null,
    subregionSlug: partial.subregionSlug ?? null,
    detailSlug: partial.detailSlug ?? null,
    fitPadding: partial.fitPadding ?? { top: 1, right: 1, bottom: 1, left: 1 },
    fitMaxZoom: partial.fitMaxZoom ?? 8,
  };
}

describe("focus state helpers", () => {
  const region = node({
    id: "region:FRA",
    slug: "france",
    regionKey: "FRA",
    bounds: [[0, 0], [10, 10]],
  });
  const subregion = node({
    id: "subregion:burgundy",
    slug: "burgundy",
    parentId: region.id,
    depth: 1,
    kind: "subregion",
    regionKey: "FRA",
    subregionSlug: "burgundy",
    bounds: [[2, 2], [4, 4]],
  });
  const detail = node({
    id: "detail:cote-de-nuits",
    slug: "cote-de-nuits",
    parentId: subregion.id,
    depth: 2,
    kind: "detail",
    regionKey: "FRA",
    subregionSlug: "burgundy",
    detailSlug: "cote-de-nuits",
    bounds: [[2.1, 2.1], [2.8, 2.8]],
  });

  const byId = new Map<string, FocusNode>([
    [region.id, region],
    [subregion.id, subregion],
    [detail.id, detail],
  ]);

  it("derives active focus tuple from node id", () => {
    expect(deriveActiveFocusState(detail.id, byId)).toEqual({
      nodeId: detail.id,
      regionKey: "FRA",
      subregionSlug: "burgundy",
      detailSlug: "cote-de-nuits",
    });
    expect(deriveActiveFocusState(null, byId)).toEqual({
      nodeId: null,
      regionKey: null,
      subregionSlug: null,
      detailSlug: null,
    });
  });

  it("prunes thresholds outside active ancestry", () => {
    const thresholds = new Map<string, number>([
      [region.id, 4],
      [subregion.id, 6],
      [detail.id, 8],
      ["region:ITA", 4],
    ]);
    pruneFocusThresholds(thresholds, subregion.id, byId);
    expect([...thresholds.keys()].sort()).toEqual([region.id, subregion.id].sort());
    pruneFocusThresholds(thresholds, null, byId);
    expect(thresholds.size).toBe(0);
  });

  it("populates thresholds for full ancestry chain", () => {
    const thresholds = new Map<string, number>();
    populateFocusThresholdsForChain(detail.id, byId, (n) => n.depth + 3, thresholds);
    expect(thresholds.get(region.id)).toBe(3);
    expect(thresholds.get(subregion.id)).toBe(4);
    expect(thresholds.get(detail.id)).toBe(5);
  });

  it("decides when zoom-out should pop focus", () => {
    const thresholds = new Map<string, number>([[subregion.id, 6]]);
    expect(shouldPopFocusOnZoomOut(7, 6.7, subregion.id, byId, thresholds, 0.35)).toEqual({
      pop: false,
      parentId: null,
    });
    expect(shouldPopFocusOnZoomOut(7, 5.4, subregion.id, byId, thresholds, 0.35)).toEqual({
      pop: true,
      parentId: region.id,
    });
  });
});
