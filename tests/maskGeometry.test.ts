import { describe, expect, it } from "vitest";
import { buildClipVertices, prepareMaskPolygons } from "../src/lib/maskGeometry";
import type { PolygonRings } from "../src/lib/geo";

describe("mask geometry", () => {
  it("prepares polygons and triangulates rings", () => {
    const polygons: PolygonRings[] = [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    ];
    const prepared = prepareMaskPolygons(polygons);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].triangleIndices.length).toBeGreaterThan(0);
  });

  it("projects prepared polygons into clip-space vertices", () => {
    const polygons: PolygonRings[] = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ];
    const prepared = prepareMaskPolygons(polygons);
    const vertices = buildClipVertices(
      prepared,
      (lon, lat) => ({ x: lon * 100, y: lat * 100 }),
      200,
      200,
      1,
    );
    expect(vertices.length).toBeGreaterThan(0);
    for (const value of vertices) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
