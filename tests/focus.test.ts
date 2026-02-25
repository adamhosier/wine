import { describe, expect, it } from "vitest";
import { buildFocusGraph, getFocusChain, hashForFocus, resolveHashToFocusNode } from "../src/lib/focus";

function square(minX: number, minY: number, maxX: number, maxY: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
  };
}

describe("focus graph", () => {
  const regions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", id: "CAL", properties: { name: "California", iso_a3: "CAL" }, geometry: square(0, 0, 10, 10) },
      { type: "Feature", id: "FRA", properties: { name: "France", iso_a3: "FRA" }, geometry: square(20, 0, 30, 10) },
    ],
  };
  const subregions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", id: "napa", properties: { slug: "napa", parent_iso_a3: "CAL" }, geometry: square(1, 1, 5, 5) },
      { type: "Feature", id: "burgundy", properties: { slug: "burgundy", parent_iso_a3: "FRA" }, geometry: square(21, 1, 26, 6) },
    ],
  };
  const details: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "rutherford",
        properties: { slug: "rutherford", parent_slug: "napa" },
        geometry: square(2, 2, 3, 3),
      },
    ],
  };

  const graph = buildFocusGraph(regions, subregions, details, 11);

  it("builds region, subregion, and detail nodes", () => {
    expect(graph.regionNodeIdByKey.get("CAL")).toBe("region:CAL");
    expect(graph.subregionNodeIdBySlug.get("napa")).toBe("subregion:napa");
    expect(graph.detailNodeIdBySlug.get("rutherford")).toBe("detail:rutherford");
  });

  it("creates parent-child chain", () => {
    const detailId = graph.detailNodeIdBySlug.get("rutherford") ?? null;
    const chain = getFocusChain(detailId, graph.focusNodeById).map((n) => n.id);
    expect(chain).toEqual(["region:CAL", "subregion:napa", "detail:rutherford"]);
  });

  it("resolves hash to deepest available node", () => {
    const resolved = resolveHashToFocusNode(
      "california-napa-rutherford",
      graph.focusChildrenByParentId,
      graph.focusNodeById,
    );
    expect(resolved).toBe("detail:rutherford");
  });

  it("falls back to best partial hash match", () => {
    const resolved = resolveHashToFocusNode(
      "california-napa-unknown",
      graph.focusChildrenByParentId,
      graph.focusNodeById,
    );
    expect(resolved).toBe("subregion:napa");
  });

  it("builds hash from focus chain", () => {
    const detailId = graph.detailNodeIdBySlug.get("rutherford") ?? null;
    expect(hashForFocus(detailId, graph.focusNodeById)).toBe("#california-napa-rutherford");
    expect(hashForFocus(null, graph.focusNodeById)).toBe("");
  });
});

