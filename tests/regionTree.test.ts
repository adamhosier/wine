import { describe, expect, it } from "vitest";
import { buildRegionTreeNodes } from "../src/lib/regionTree";

function square(minX: number, minY: number, maxX: number, maxY: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
  };
}

describe("region tree", () => {
  it("builds arbitrary-depth nodes from parent_node_id links", () => {
    const regions: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "UK", iso_a3: "GBR", node_id: "region:GBR", slug: "uk" },
          geometry: square(-10, 49, 2, 59),
        },
      ],
    };
    const hierarchy: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            node_id: "subregion:england",
            parent_node_id: "region:GBR",
            slug: "england",
          },
          geometry: square(-6, 50, 2, 56),
        },
        {
          type: "Feature",
          properties: {
            node_id: "detail:london",
            parent_node_id: "subregion:england",
            slug: "london",
          },
          geometry: square(-1, 51, 1, 52),
        },
        {
          type: "Feature",
          properties: {
            node_id: "detail:hackney",
            parent_node_id: "detail:london",
            slug: "hackney",
          },
          geometry: square(-0.2, 51.5, 0.1, 51.6),
        },
      ],
    };

    const nodes = buildRegionTreeNodes(regions, hierarchy, 11);
    expect(nodes.map((node) => node.id)).toEqual([
      "region:GBR",
      "subregion:england",
      "detail:london",
      "detail:hackney",
    ]);
    expect(nodes[1].depth).toBe(1);
    expect(nodes[2].depth).toBe(2);
    expect(nodes[3].depth).toBe(3);
    expect(nodes[3].parentId).toBe("detail:london");
  });
});
