import { describe, expect, it } from "vitest";
import {
  buildPolygonsBySlug,
  buildRegionLabelByKey,
  buildRegionPolygonsByKey,
  collectBboxes,
  collectRegionPolygons,
  findRegionBoundsByKey,
  mergeBboxes,
} from "../src/lib/regionIndex";

function square(minX: number, minY: number, maxX: number, maxY: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
  };
}

describe("region indexes", () => {
  const regions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", id: "FRA", properties: { name: "France", iso_a3: "FRA" }, geometry: square(0, 0, 3, 3) },
      { type: "Feature", id: "ITA", properties: { name: "Italy", iso_a3: "ITA" }, geometry: square(4, 0, 7, 3) },
    ],
  };

  it("builds label and polygon indexes", () => {
    const labels = buildRegionLabelByKey(regions);
    expect(labels.get("FRA")).toBe("France");

    const polygons = collectRegionPolygons(regions);
    expect(polygons).toHaveLength(2);

    const byKey = buildRegionPolygonsByKey(regions);
    expect(byKey.get("ITA")).toHaveLength(1);
  });

  it("collects and merges bounding boxes", () => {
    const bboxes = collectBboxes(regions);
    expect(bboxes).toEqual([
      [0, 0, 3, 3],
      [4, 0, 7, 3],
    ]);
    expect(mergeBboxes(bboxes, [-1, -1, -1, -1])).toEqual([0, 0, 7, 3]);
    expect(mergeBboxes([], [-1, -1, -1, -1])).toEqual([-1, -1, -1, -1]);
  });

  it("finds region bounds by key", () => {
    expect(findRegionBoundsByKey(regions, "FRA")).toEqual([0, 0, 3, 3]);
    expect(findRegionBoundsByKey(regions, "XXX")).toBeNull();
  });

  it("indexes polygons by slug", () => {
    const subregions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "napa", properties: { slug: "napa" }, geometry: square(0, 0, 1, 1) },
        { type: "Feature", id: "sonoma", properties: { slug: "sonoma" }, geometry: square(1, 1, 2, 2) },
      ],
    };
    const bySlug = buildPolygonsBySlug(subregions);
    expect(bySlug.get("napa")).toHaveLength(1);
    expect(bySlug.get("sonoma")).toHaveLength(1);
  });
});
