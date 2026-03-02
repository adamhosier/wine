export const NASA_LAYER = "BlueMarble_ShadedRelief_Bathymetry";
export const NASA_TIME = "2012-07-09";
export const NASA_TILE_MATRIX_SET = "GoogleMapsCompatible_Level8";
export const NASA_TILE_FORMAT = "jpg";
export const WINE_REGION_TILE_FORMAT = "jpg";
export const WINE_REGION_REMOTE_TILE_TEMPLATE =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

export const Z_BASE = 5;
export const HI_Z_DELTA = 3;
export const Z_HI = Z_BASE + HI_Z_DELTA;
export const SUBREGION_MID_Z_DELTA = -0.5;
export const Z_SUBREGION_MID = Z_HI + SUBREGION_MID_Z_DELTA;
export const SUBREGION_HI_Z_DELTA = 3;
export const Z_SUBREGION_HI = Z_HI + SUBREGION_HI_Z_DELTA;

export const WINE_REGION_MID_TILE_RELATIVE_TEMPLATE = "tiles/wine-subregions-mid/{z}/{x}/{y}.jpg";
export const WINE_REGION_TILE_RELATIVE_TEMPLATE = "tiles/wine-subregions/{z}/{x}/{y}.jpg";

export const INITIAL_CENTER: [number, number] = [0, 20];
export const INITIAL_ZOOM = 1.8;
