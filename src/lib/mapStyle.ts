import type { StyleSpecification } from "maplibre-gl";
import {
  NASA_LAYER,
  NASA_TILE_FORMAT,
  NASA_TILE_MATRIX_SET,
  NASA_TIME,
  WINE_REGION_MID_TILE_RELATIVE_TEMPLATE,
  WINE_REGION_REMOTE_TILE_TEMPLATE,
  WINE_REGION_TILE_RELATIVE_TEMPLATE,
  WORLD_BBOX,
  Z_SUBREGION_HI,
  Z_SUBREGION_MID,
} from "../config";

export function toSubregionLocalTileTemplate(basePath: string) {
  return `${basePath}${WINE_REGION_TILE_RELATIVE_TEMPLATE}`;
}

export function toSubregionMidLocalTileTemplate(basePath: string) {
  return `${basePath}${WINE_REGION_MID_TILE_RELATIVE_TEMPLATE}`;
}

export function toSubregionRemoteTileTemplate() {
  return WINE_REGION_REMOTE_TILE_TEMPLATE;
}

export function toNasaTileTemplate() {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/${NASA_TIME}/${NASA_TILE_MATRIX_SET}/{z}/{y}/{x}.${NASA_TILE_FORMAT}`;
}

export function createMapStyle(
  subregionMidTilesTemplate: string,
  subregionTilesTemplate: string,
  options?: {
    includeLocalTiers?: boolean;
    wineRegionBounds?: [number, number, number, number];
    wineRegionBoundsByKey?: Array<{
      key: string;
      bounds: [number, number, number, number];
    }>;
  },
): StyleSpecification {
  const includeLocalTiers = options?.includeLocalTiers ?? true;
  const wineRegionBounds = options?.wineRegionBounds ?? WORLD_BBOX;
  const wineRegionBoundsByKey =
    options?.wineRegionBoundsByKey?.length
      ? options.wineRegionBoundsByKey
      : [{ key: "default", bounds: wineRegionBounds }];

  const layers: StyleSpecification["layers"] = [{ id: "nasa-base", type: "raster", source: "nasa" }];
  if (includeLocalTiers) {
    for (const { key } of wineRegionBoundsByKey) {
      const suffix = key.toLowerCase();
      layers.push(
        {
          id: `wine-subregion-mid-remote-${suffix}`,
          type: "raster",
          source: `wine_subregion_mid_remote_${suffix}`,
          minzoom: Z_SUBREGION_MID,
          maxzoom: Z_SUBREGION_HI,
          paint: {
            "raster-fade-duration": 0,
          },
        },
        {
          id: `wine-subregion-mid-local-${suffix}`,
          type: "raster",
          source: `wine_subregion_mid_cache_${suffix}`,
          minzoom: Z_SUBREGION_MID,
          maxzoom: Z_SUBREGION_HI,
          paint: {
            "raster-fade-duration": 0,
          },
        },
        {
          id: `wine-subregion-remote-${suffix}`,
          type: "raster",
          source: `wine_subregion_local_remote_${suffix}`,
          minzoom: Z_SUBREGION_HI,
          paint: {
            "raster-fade-duration": 0,
          },
        },
        {
          id: `wine-subregion-local-${suffix}`,
          type: "raster",
          source: `wine_subregion_local_cache_${suffix}`,
          minzoom: Z_SUBREGION_HI,
          paint: {
            "raster-fade-duration": 0,
          },
        },
      );
    }
  }

  const regionalSources = wineRegionBoundsByKey.flatMap(({ key, bounds }) => {
    const suffix = key.toLowerCase();
    return [
      [
        `wine_subregion_local_cache_${suffix}`,
        {
          type: "raster",
          tiles: [subregionTilesTemplate],
          tileSize: 256,
          bounds,
        },
      ],
      [
        `wine_subregion_local_remote_${suffix}`,
        {
          type: "raster",
          tiles: [toSubregionRemoteTileTemplate()],
          tileSize: 256,
          bounds,
        },
      ],
      [
        `wine_subregion_mid_cache_${suffix}`,
        {
          type: "raster",
          tiles: [subregionMidTilesTemplate],
          tileSize: 256,
          bounds,
        },
      ],
      [
        `wine_subregion_mid_remote_${suffix}`,
        {
          type: "raster",
          tiles: [toSubregionRemoteTileTemplate()],
          tileSize: 256,
          bounds,
        },
      ],
    ] as const;
  });

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      nasa: {
        type: "raster",
        tiles: [toNasaTileTemplate()],
        tileSize: 256,
        attribution: "Imagery: NASA GIBS",
      },
      ...Object.fromEntries(regionalSources),
    },
    layers,
  };
}

export function createPoiStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {},
    layers: [],
  };
}
