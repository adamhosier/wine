import { describe, expect, it } from "vitest";
import {
  createMapStyle,
  createPoiStyle,
  toSubregionLocalTileTemplate,
  toSubregionMidLocalTileTemplate,
  toSubregionRemoteTileTemplate,
} from "../src/lib/mapStyle";
import { WORLD_BBOX } from "../src/config";

describe("map style", () => {
  it("builds tile templates from base path", () => {
    expect(toSubregionMidLocalTileTemplate("/wine/")).toBe("/wine/tiles/wine-subregions-mid/{z}/{x}/{y}.jpg");
    expect(toSubregionLocalTileTemplate("/wine/")).toBe("/wine/tiles/wine-subregions/{z}/{x}/{y}.jpg");
    expect(toSubregionRemoteTileTemplate()).toContain("arcgisonline.com");
  });

  it("creates deterministic local/remote source separation with bounds", () => {
    const style = createMapStyle("mid", "high");
    const sources = style.sources as Record<string, any>;

    expect(sources.nasa.tiles).toHaveLength(1);

    expect(sources.wine_subregion_mid_cache_default.tiles).toEqual(["mid"]);
    expect(sources.wine_subregion_mid_remote_default.tiles).toHaveLength(1);
    expect(sources.wine_subregion_mid_cache_default.bounds).toEqual(WORLD_BBOX);
    expect(sources.wine_subregion_local_cache_default.tiles).toEqual(["high"]);
    expect(sources.wine_subregion_local_remote_default.tiles).toHaveLength(1);
  });

  it("orders layers so local overlays remote at same zoom tier", () => {
    const style = createMapStyle("mid", "high");
    const ids = style.layers.map((layer) => layer.id);
    expect(ids.indexOf("wine-subregion-mid-remote-default")).toBeLessThan(ids.indexOf("wine-subregion-mid-local-default"));
    expect(ids.indexOf("wine-subregion-remote-default")).toBeLessThan(ids.indexOf("wine-subregion-local-default"));
  });

  it("can omit local tiers for processed/low-cost map", () => {
    const style = createMapStyle("mid", "high", { includeLocalTiers: false });
    const ids = style.layers.map((layer) => layer.id);
    expect(ids).toEqual(["nasa-base"]);
  });

  it("disables raster cross-fade for high-frequency zoom transitions", () => {
    const style = createMapStyle("mid", "high");
    const midRemote = style.layers.find((layer) => layer.id === "wine-subregion-mid-remote-default");
    expect(midRemote?.paint).toEqual({ "raster-fade-duration": 0 });
  });

  it("accepts explicit raster bounds", () => {
    const style = createMapStyle("mid", "high", {
      wineRegionBounds: [5, 6, 7, 8],
    });
    const sources = style.sources as Record<string, any>;
    expect(sources.wine_subregion_local_cache_default.bounds).toEqual([5, 6, 7, 8]);
  });

  it("supports per-root-region raster bounds instead of one merged world-scale bbox", () => {
    const style = createMapStyle("mid", "high", {
      wineRegionBoundsByKey: [
        { key: "FRA", bounds: [1, 2, 3, 4] },
        { key: "USA", bounds: [5, 6, 7, 8] },
      ],
    });
    const sources = style.sources as Record<string, any>;
    const ids = style.layers.map((layer) => layer.id);

    expect(sources.wine_subregion_local_cache_fra.bounds).toEqual([1, 2, 3, 4]);
    expect(sources.wine_subregion_local_cache_usa.bounds).toEqual([5, 6, 7, 8]);
    expect(ids).toContain("wine-subregion-local-fra");
    expect(ids).toContain("wine-subregion-local-usa");
  });

  it("creates empty poi style", () => {
    const poiStyle = createPoiStyle();
    expect(poiStyle.layers).toEqual([]);
    expect(poiStyle.sources).toEqual({});
  });
});
