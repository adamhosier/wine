import { describe, expect, it } from "vitest";
import type { PolygonRings } from "../src/lib/geo";
import { selectMaskPolygons } from "../src/lib/maskSelection";

const world: PolygonRings[] = [[[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]];
const fra: PolygonRings[] = [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]];
const burgundy: PolygonRings[] = [[[[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1], [0.5, 0.5]]]];
const nuits: PolygonRings[] = [[[[0.6, 0.6], [0.8, 0.6], [0.8, 0.8], [0.6, 0.8], [0.6, 0.6]]]];

describe("mask selection", () => {
  const base = {
    allRegionPolygons: world,
    regionPolygonsByKey: new Map([["FRA", fra]]),
    subregionPolygonsBySlug: new Map([["burgundy", burgundy]]),
    detailPolygonsBySlug: new Map([["cote-de-nuits", nuits]]),
  };

  it("prefers detail polygons over parent levels", () => {
    const selected = selectMaskPolygons({
      ...base,
      activeRegionKey: "FRA",
      activeSubregionSlug: "burgundy",
      activeDetailSlug: "cote-de-nuits",
    });
    expect(selected).toBe(nuits);
  });

  it("falls back through subregion, region, then world", () => {
    expect(
      selectMaskPolygons({
        ...base,
        activeRegionKey: "FRA",
        activeSubregionSlug: "burgundy",
        activeDetailSlug: null,
      }),
    ).toBe(burgundy);

    expect(
      selectMaskPolygons({
        ...base,
        activeRegionKey: "FRA",
        activeSubregionSlug: null,
        activeDetailSlug: null,
      }),
    ).toBe(fra);

    expect(
      selectMaskPolygons({
        ...base,
        activeRegionKey: null,
        activeSubregionSlug: null,
        activeDetailSlug: null,
      }),
    ).toBe(world);
  });
});
