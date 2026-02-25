import { describe, expect, it } from "vitest";
import {
  createMapStyle,
  createPoiStyle,
  toLocalTileTemplate,
  toSubregionLocalTileTemplate,
  toSubregionMidLocalTileTemplate,
  toSubregionRemoteTileTemplate,
} from "../src/lib/mapStyle";
import { FRANCE_BBOX } from "../src/config";

describe("map style", () => {
  it("builds tile templates from base path", () => {
    expect(toLocalTileTemplate("/wine/")).toBe("/wine/tiles/france/{z}/{x}/{y}.jpg");
    expect(toSubregionMidLocalTileTemplate("/wine/")).toBe("/wine/tiles/france-subregions-mid/{z}/{x}/{y}.jpg");
    expect(toSubregionLocalTileTemplate("/wine/")).toBe("/wine/tiles/france-subregions/{z}/{x}/{y}.jpg");
    expect(toSubregionRemoteTileTemplate()).toContain("arcgisonline.com");
  });

  it("creates deterministic local/remote source separation with bounds", () => {
    const style = createMapStyle("local", "mid", "high");
    const sources = style.sources as Record<string, any>;

    expect(sources.france_local.tiles).toEqual(["local"]);
    expect(sources.france_local.bounds).toEqual(FRANCE_BBOX);

    expect(sources.france_subregion_mid_cache.tiles).toEqual(["mid"]);
    expect(sources.france_subregion_mid_remote.tiles).toHaveLength(1);
    expect(sources.france_subregion_mid_cache.bounds).toEqual(FRANCE_BBOX);
    expect(sources.france_subregion_local_cache.tiles).toEqual(["high"]);
    expect(sources.france_subregion_local_remote.tiles).toHaveLength(1);
  });

  it("orders layers so local overlays remote at same zoom tier", () => {
    const style = createMapStyle("local", "mid", "high");
    const ids = style.layers.map((layer) => layer.id);
    expect(ids.indexOf("france-subregion-mid-remote")).toBeLessThan(ids.indexOf("france-subregion-mid-local"));
    expect(ids.indexOf("france-subregion-remote")).toBeLessThan(ids.indexOf("france-subregion-local"));
  });

  it("can omit local tiers for processed/low-cost map", () => {
    const style = createMapStyle("local", "mid", "high", { includeLocalTiers: false });
    const ids = style.layers.map((layer) => layer.id);
    expect(ids).toEqual(["nasa-base"]);
  });

  it("disables raster cross-fade for high-frequency zoom transitions", () => {
    const style = createMapStyle("local", "mid", "high");
    const midRemote = style.layers.find((layer) => layer.id === "france-subregion-mid-remote");
    expect(midRemote?.paint).toEqual({ "raster-fade-duration": 0 });
  });

  it("accepts explicit raster bounds", () => {
    const style = createMapStyle("local", "mid", "high", {
      franceBounds: [1, 2, 3, 4],
      wineRegionBounds: [5, 6, 7, 8],
    });
    const sources = style.sources as Record<string, any>;
    expect(sources.france_local.bounds).toEqual([1, 2, 3, 4]);
    expect(sources.france_subregion_local_cache.bounds).toEqual([5, 6, 7, 8]);
  });

  it("creates empty poi style", () => {
    const poiStyle = createPoiStyle();
    expect(poiStyle.layers).toEqual([]);
    expect(poiStyle.sources).toEqual({});
  });
});
