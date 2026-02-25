import { describe, expect, it } from "vitest";
import type { PolygonRings } from "../src/lib/geo";
import { selectMaskPolygons } from "../src/lib/maskSelection";

const world: PolygonRings[] = [[[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]];
const uk: PolygonRings[] = [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]];
const england: PolygonRings[] = [[[[0.5, 0.5], [1.8, 0.5], [1.8, 1.8], [0.5, 1.8], [0.5, 0.5]]]];

describe("mask selection", () => {
  it("uses focused node polygons when available", () => {
    const selected = selectMaskPolygons({
      activeNodeId: "subregion:england",
      allRootPolygons: world,
      polygonsByNodeId: new Map([
        ["region:GBR", uk],
        ["subregion:england", england],
      ]),
    });
    expect(selected).toBe(england);
  });

  it("falls back to all root polygons when unfocused or missing", () => {
    const input = {
      allRootPolygons: world,
      polygonsByNodeId: new Map<string, PolygonRings[]>([["region:GBR", uk]]),
    };
    expect(selectMaskPolygons({ ...input, activeNodeId: null })).toBe(world);
    expect(selectMaskPolygons({ ...input, activeNodeId: "missing" })).toBe(world);
  });
});
