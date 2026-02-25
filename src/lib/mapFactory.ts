import maplibregl, { type LngLatLike, type StyleSpecification } from "maplibre-gl";

export type MapFactoryOptions = {
  container: HTMLElement;
  style: StyleSpecification;
  center: LngLatLike;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  interactive: boolean;
};

export function createRuntimeMap(options: MapFactoryOptions): maplibregl.Map {
  return new maplibregl.Map({
    container: options.container,
    style: options.style,
    center: options.center,
    zoom: options.zoom,
    interactive: options.interactive,
    attributionControl: false,
    maxZoom: options.maxZoom,
    minZoom: options.minZoom,
    renderWorldCopies: false,
    cancelPendingTileRequestsWhileZooming: true,
    maxTileCacheZoomLevels: 8,
    refreshExpiredTiles: false,
    fadeDuration: 0,
    validateStyle: false,
  });
}
