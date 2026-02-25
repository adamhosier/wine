import type { StyleSpecification } from "maplibre-gl";
import {
  FRANCE_BBOX,
  LOCAL_TILE_RELATIVE_TEMPLATE,
  NASA_LAYER,
  NASA_TILE_FORMAT,
  NASA_TILE_MATRIX_SET,
  NASA_TIME,
  SUBREGION_MID_TILE_RELATIVE_TEMPLATE,
  SUBREGION_REMOTE_TILE_TEMPLATE,
  SUBREGION_TILE_RELATIVE_TEMPLATE,
  Z_HI,
  Z_SUBREGION_HI,
  Z_SUBREGION_MID,
} from "../config";

export function toLocalTileTemplate(basePath: string) {
  return `${basePath}${LOCAL_TILE_RELATIVE_TEMPLATE}`;
}

export function toSubregionLocalTileTemplate(basePath: string) {
  return `${basePath}${SUBREGION_TILE_RELATIVE_TEMPLATE}`;
}

export function toSubregionMidLocalTileTemplate(basePath: string) {
  return `${basePath}${SUBREGION_MID_TILE_RELATIVE_TEMPLATE}`;
}

export function toSubregionRemoteTileTemplate() {
  return SUBREGION_REMOTE_TILE_TEMPLATE;
}

export function toNasaTileTemplate() {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/${NASA_TIME}/${NASA_TILE_MATRIX_SET}/{z}/{y}/{x}.${NASA_TILE_FORMAT}`;
}

export function createMapStyle(
  localTilesTemplate: string,
  subregionMidTilesTemplate: string,
  subregionTilesTemplate: string,
  options?: {
    includeLocalTiers?: boolean;
    franceBounds?: [number, number, number, number];
    wineRegionBounds?: [number, number, number, number];
  },
): StyleSpecification {
  const includeLocalTiers = options?.includeLocalTiers ?? true;
  const franceBounds = options?.franceBounds ?? FRANCE_BBOX;
  const wineRegionBounds = options?.wineRegionBounds ?? FRANCE_BBOX;

  const layers: StyleSpecification["layers"] = [{ id: "nasa-base", type: "raster", source: "nasa" }];
  if (includeLocalTiers) {
    layers.push(
      {
        id: "france-local",
        type: "raster",
        source: "france_local",
        minzoom: Z_HI,
        paint: {
          "raster-fade-duration": 0,
        },
      },
      {
        id: "france-subregion-mid-remote",
        type: "raster",
        source: "france_subregion_mid_remote",
        minzoom: Z_SUBREGION_MID,
        maxzoom: Z_SUBREGION_HI,
        paint: {
          "raster-fade-duration": 0,
        },
      },
      {
        id: "france-subregion-mid-local",
        type: "raster",
        source: "france_subregion_mid_cache",
        minzoom: Z_SUBREGION_MID,
        maxzoom: Z_SUBREGION_HI,
        paint: {
          "raster-fade-duration": 0,
        },
      },
      {
        id: "france-subregion-remote",
        type: "raster",
        source: "france_subregion_local_remote",
        minzoom: Z_SUBREGION_HI,
        paint: {
          "raster-fade-duration": 0,
        },
      },
      {
        id: "france-subregion-local",
        type: "raster",
        source: "france_subregion_local_cache",
        minzoom: Z_SUBREGION_HI,
        paint: {
          "raster-fade-duration": 0,
        },
      },
    );
  }

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
      france_local: {
        type: "raster",
        tiles: [localTilesTemplate],
        tileSize: 256,
        bounds: franceBounds,
      },
      france_subregion_local_cache: {
        type: "raster",
        tiles: [subregionTilesTemplate],
        tileSize: 256,
        bounds: wineRegionBounds,
      },
      france_subregion_local_remote: {
        type: "raster",
        tiles: [toSubregionRemoteTileTemplate()],
        tileSize: 256,
        bounds: wineRegionBounds,
      },
      france_subregion_mid_cache: {
        type: "raster",
        tiles: [subregionMidTilesTemplate],
        tileSize: 256,
        bounds: wineRegionBounds,
      },
      france_subregion_mid_remote: {
        type: "raster",
        tiles: [toSubregionRemoteTileTemplate()],
        tileSize: 256,
        bounds: wineRegionBounds,
      },
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
