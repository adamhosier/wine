import type maplibregl from "maplibre-gl";
import type {
  DetailFeatureCollection,
  RegionsFeatureCollection,
  SubregionsFeatureCollection,
  WaypointFeatureCollection,
} from "./data";

export function addVectorLayers(
  map: maplibregl.Map,
  regions: RegionsFeatureCollection,
  waypoints: WaypointFeatureCollection,
  includeWaypoints = true,
) {
  if (!map.getSource("regions")) {
    map.addSource("regions", { type: "geojson", data: regions as GeoJSON.GeoJSON });
  }
  if (!map.getLayer("regions-hit-fill")) {
    map.addLayer({
      id: "regions-hit-fill",
      type: "fill",
      source: "regions",
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0,
      },
    });
  }
  if (!map.getLayer("regions-outline")) {
    map.addLayer({
      id: "regions-outline",
      type: "line",
      source: "regions",
      paint: {
        "line-color": "#7a1f2b",
        "line-width": 2,
      },
    });
  }
  if (includeWaypoints) {
    if (!map.getSource("waypoints")) {
      map.addSource("waypoints", { type: "geojson", data: waypoints as GeoJSON.GeoJSON });
    }
    if (!map.getLayer("waypoints-circle")) {
      map.addLayer({
        id: "waypoints-circle",
        type: "circle",
        source: "waypoints",
        layout: {
          visibility: "none",
        },
        paint: {
          "circle-color": "#ff8f00",
          "circle-stroke-color": "#2a2a2a",
          "circle-stroke-width": 1.25,
          "circle-radius": 4,
        },
      });
    }
    if (!map.getLayer("waypoints-label")) {
      map.addLayer({
        id: "waypoints-label",
        type: "symbol",
        source: "waypoints",
        layout: {
          visibility: "none",
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.1],
        },
        paint: {
          "text-color": "#fffde7",
          "text-halo-color": "#212121",
          "text-halo-width": 1.2,
        },
      });
    }
  }
}

export function addSubregionLayers(map: maplibregl.Map, data: SubregionsFeatureCollection) {
  if (!map.getSource("france-subregions")) {
    map.addSource("france-subregions", {
      type: "geojson",
      data: data as GeoJSON.GeoJSON,
    });
  }
  if (!map.getLayer("france-subregions-line")) {
    map.addLayer({
      id: "france-subregions-line",
      type: "line",
      source: "france-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "line-color": "#a65d62",
        "line-width": 1.3,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("france-subregions-hit-fill")) {
    map.addLayer({
      id: "france-subregions-hit-fill",
      type: "fill",
      source: "france-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0,
      },
    });
  }
}

export function addDetailLayers(map: maplibregl.Map, details: DetailFeatureCollection) {
  if (!map.getSource("burgundy-detail-subregions")) {
    map.addSource("burgundy-detail-subregions", {
      type: "geojson",
      data: details as GeoJSON.GeoJSON,
    });
  }
  if (!map.getLayer("burgundy-detail-subregions-line")) {
    map.addLayer({
      id: "burgundy-detail-subregions-line",
      type: "line",
      source: "burgundy-detail-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "line-color": "#c8888c",
        "line-width": 1.4,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("burgundy-detail-subregions-hit-fill")) {
    map.addLayer({
      id: "burgundy-detail-subregions-hit-fill",
      type: "fill",
      source: "burgundy-detail-subregions",
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0,
      },
    });
  }
}

