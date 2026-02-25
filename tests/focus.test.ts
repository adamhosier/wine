import { describe, expect, it } from "vitest";
import {
  buildFocusGraphFromNodes,
  getFocusChain,
  hashForFocus,
  resolveHashToFocusNode,
  type FocusNode,
} from "../src/lib/focus";

const nodes: FocusNode[] = [
  {
    id: "region:GBR",
    slug: "uk",
    parentId: null,
    depth: 0,
    kind: "region",
    regionKey: "GBR",
    subregionSlug: null,
    detailSlug: null,
    bounds: [[0, 0], [10, 10]],
    fitPadding: { top: 10, right: 10, bottom: 10, left: 10 },
    fitMaxZoom: 6,
  },
  {
    id: "subregion:england",
    slug: "england",
    parentId: "region:GBR",
    depth: 1,
    kind: "subregion",
    regionKey: "GBR",
    subregionSlug: "england",
    detailSlug: null,
    bounds: [[1, 1], [8, 8]],
    fitPadding: { top: 8, right: 8, bottom: 8, left: 8 },
    fitMaxZoom: 8,
  },
  {
    id: "detail:london",
    slug: "london",
    parentId: "subregion:england",
    depth: 2,
    kind: "detail",
    regionKey: "GBR",
    subregionSlug: "england",
    detailSlug: "london",
    bounds: [[2, 2], [4, 4]],
    fitPadding: { top: 6, right: 6, bottom: 6, left: 6 },
    fitMaxZoom: 10,
  },
];

describe("focus graph", () => {
  const graph = buildFocusGraphFromNodes(nodes);

  it("indexes node ids by kind keys", () => {
    expect(graph.regionNodeIdByKey.get("GBR")).toBe("region:GBR");
    expect(graph.subregionNodeIdBySlug.get("england")).toBe("subregion:england");
    expect(graph.detailNodeIdBySlug.get("london")).toBe("detail:london");
  });

  it("creates parent-child chain", () => {
    const chain = getFocusChain("detail:london", graph.focusNodeById).map((n) => n.id);
    expect(chain).toEqual(["region:GBR", "subregion:england", "detail:london"]);
  });

  it("resolves hash to deepest available node", () => {
    const resolved = resolveHashToFocusNode("uk-england-london", graph.focusChildrenByParentId, graph.focusNodeById);
    expect(resolved).toBe("detail:london");
  });

  it("falls back to best partial hash match", () => {
    const resolved = resolveHashToFocusNode("uk-england-missing", graph.focusChildrenByParentId, graph.focusNodeById);
    expect(resolved).toBe("subregion:england");
  });

  it("builds hash from focus chain", () => {
    expect(hashForFocus("detail:london", graph.focusNodeById)).toBe("#uk-england-london");
    expect(hashForFocus(null, graph.focusNodeById)).toBe("");
  });
});
