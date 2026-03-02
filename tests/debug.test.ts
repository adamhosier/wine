import { describe, expect, it } from "vitest";
import { describeTileSource, hasMeaningfulDebugDelta, type DebugSnapshot } from "../src/lib/debug";

describe("debug helpers", () => {
  const rootRegionBounds: Array<[number, number, number, number]> = [[-5, 41, 10, 52]];
  const subregionBounds: Array<[number, number, number, number]> = [[-1, 43, 3, 47]];

  it("describes nasa source outside local bounds", () => {
    expect(describeTileSource(3, 20, 20, rootRegionBounds, subregionBounds, 7.5, 11)).toBe("NASA");
  });

  it("describes root-region context outside wine subregions", () => {
    expect(describeTileSource(8.2, 8, 50, rootRegionBounds, subregionBounds, 7.5, 11)).toBe(
      "NASA (Root Region Context)",
    );
  });

  it("describes subregion mid and ultra tiers", () => {
    expect(describeTileSource(9, 1, 45, rootRegionBounds, subregionBounds, 7.5, 11)).toBe(
      "Local Wine Region Mid + NASA fallback",
    );
    expect(describeTileSource(11.3, 1, 45, rootRegionBounds, subregionBounds, 7.5, 11)).toBe(
      "Local Wine Region Ultra + Mid + NASA fallback",
    );
  });

  it("detects meaningful snapshot deltas", () => {
    const a: DebugSnapshot = { zoom: 4, centerLon: 1, centerLat: 2, source: "NASA" };
    const b: DebugSnapshot = { zoom: 4.001, centerLon: 1.0001, centerLat: 2.0001, source: "NASA" };
    const c: DebugSnapshot = { zoom: 4.2, centerLon: 1.0001, centerLat: 2.0001, source: "NASA" };
    const d: DebugSnapshot = { zoom: 4.001, centerLon: 1.0001, centerLat: 2.0001, source: "Local Wine Region Mid" };

    expect(hasMeaningfulDebugDelta(null, a)).toBe(true);
    expect(hasMeaningfulDebugDelta(a, b)).toBe(false);
    expect(hasMeaningfulDebugDelta(a, c)).toBe(true);
    expect(hasMeaningfulDebugDelta(a, d)).toBe(true);
  });
});
