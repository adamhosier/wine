import { describe, expect, it } from "vitest";
import {
  clickedFeatureKey,
  featureBounds,
  geometryBoundsCenter,
  inBbox,
  longestPrefixMatch,
  normalizeRing,
  polygonsFromGeometry,
  regionSlug,
} from "../src/lib/geo";

describe("geo helpers", () => {
  it("checks bbox containment", () => {
    expect(inBbox(2, 3, [0, 0, 4, 4])).toBe(true);
    expect(inBbox(5, 3, [0, 0, 4, 4])).toBe(false);
  });

  it("computes geometry center from bbox extents", () => {
    const polygon: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]],
    };
    expect(geometryBoundsCenter(polygon)).toEqual([1, 2]);
  });

  it("computes bounds for polygon and multipolygon", () => {
    const polygon: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[0, 1], [4, 1], [4, 3], [0, 3], [0, 1]]],
    };
    const multi: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[-2, -1], [-1, -1], [-1, 0], [-2, 0], [-2, -1]]],
      ],
    };
    expect(featureBounds(polygon)).toEqual([
      [0, 1],
      [4, 3],
    ]);
    expect(featureBounds(multi)).toEqual([
      [-2, -1],
      [1, 1],
    ]);
  });

  it("extracts clicked key and normalized region slug", () => {
    const feature: GeoJSON.Feature = {
      type: "Feature",
      id: "FRA",
      properties: { name: "United States of America", iso_a3: "USA" },
      geometry: null,
    };
    expect(clickedFeatureKey(feature)).toBe("USA");
    expect(regionSlug(feature)).toBe("united-states-of-america");
  });

  it("normalizes closed rings and keeps open rings", () => {
    const closed = [[0, 0], [1, 0], [0, 0]];
    const open = [[0, 0], [1, 0], [1, 1]];
    expect(normalizeRing(closed)).toEqual([[0, 0], [1, 0]]);
    expect(normalizeRing(open)).toEqual(open);
  });

  it("returns polygon list from polygon/multipolygon", () => {
    const polygon: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    };
    const multi: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[2, 2], [3, 2], [3, 3], [2, 2]]],
      ],
    };
    expect(polygonsFromGeometry(polygon)).toHaveLength(1);
    expect(polygonsFromGeometry(multi)).toHaveLength(2);
  });

  it("finds the longest matching slug prefix", () => {
    const value = "california-napa-rutherford";
    const candidates = ["california", "california-napa", "france"];
    expect(longestPrefixMatch(value, candidates)).toBe("california-napa");
    expect(longestPrefixMatch("x", candidates)).toBeNull();
  });
});

