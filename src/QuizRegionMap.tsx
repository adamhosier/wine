import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { LngLatBoundsLike, StyleSpecification } from "maplibre-gl";
import { toNasaTileTemplate } from "./lib/mapStyle";

type Props = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bounds: [[number, number], [number, number]];
};

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      nasa: {
        type: "raster",
        tiles: [toNasaTileTemplate()],
        tileSize: 256,
      },
      highlight: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [
      {
        id: "nasa-base",
        type: "raster",
        source: "nasa",
      },
      {
        id: "highlight-fill",
        type: "fill",
        source: "highlight",
        paint: {
          "fill-color": "#c06254",
          "fill-opacity": 0.24,
        },
      },
      {
        id: "highlight-line",
        type: "line",
        source: "highlight",
        paint: {
          "line-color": "#f1bcaa",
          "line-width": 2,
        },
      },
    ],
  };
}

export default function QuizRegionMap({ geometry, bounds }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const style = useMemo(() => buildStyle(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const map = new maplibregl.Map({
      container,
      style,
      interactive: false,
      attributionControl: false,
      boxZoom: false,
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      doubleClickZoom: false,
      keyboard: false,
      touchZoomRotate: false,
      pitchWithRotate: false,
      minZoom: 1.2,
      maxZoom: 8.5,
    });
    mapRef.current = map;

    const feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry,
    };

    map.once("load", () => {
      const source = map.getSource("highlight") as maplibregl.GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features: [feature] });
      map.fitBounds(bounds as LngLatBoundsLike, {
        padding: { top: 24, right: 24, bottom: 24, left: 24 },
        maxZoom: 6.8,
        duration: 0,
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [bounds, geometry, style]);

  return <div ref={containerRef} className="quiz-region-map" />;
}
