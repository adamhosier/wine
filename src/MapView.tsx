import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type LngLatLike, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import earcut from "earcut";
import regionsGeoJsonRaw from "./data/regions.geojson?raw";
import {
  FRANCE_BBOX,
  HI_Z_DELTA,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  LOCAL_TILE_RELATIVE_TEMPLATE,
  NASA_LAYER,
  NASA_TILE_FORMAT,
  NASA_TILE_MATRIX_SET,
  NASA_TIME,
  Z_BASE,
  Z_HI,
} from "./config";

type PolygonRings = number[][][];
type RegionsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type RegionFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const REGIONS_DATA = JSON.parse(regionsGeoJsonRaw) as RegionsFeatureCollection;
const WAYPOINTS: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Paris" },
      geometry: { type: "Point", coordinates: [2.3522, 48.8566] },
    },
    {
      type: "Feature",
      properties: { name: "Rome" },
      geometry: { type: "Point", coordinates: [12.4964, 41.9028] },
    },
  ],
};

function inBbox(lon: number, lat: number, [minLon, minLat, maxLon, maxLat]: [number, number, number, number]) {
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function toLocalTileTemplate() {
  return `${import.meta.env.BASE_URL}${LOCAL_TILE_RELATIVE_TEMPLATE}`;
}

function toNasaTileTemplate() {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/${NASA_TIME}/${NASA_TILE_MATRIX_SET}/{z}/{y}/{x}.${NASA_TILE_FORMAT}`;
}

function createMapStyle(localTilesTemplate: string): StyleSpecification {
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
        bounds: FRANCE_BBOX,
      },
    },
    layers: [
      { id: "nasa-base", type: "raster", source: "nasa" },
      { id: "france-local", type: "raster", source: "france_local", minzoom: Z_HI },
    ],
  };
}

function normalizeRing(ring: number[][]): number[][] {
  if (ring.length < 2) {
    return ring;
  }
  const [startLon, startLat] = ring[0];
  const [endLon, endLat] = ring[ring.length - 1];
  if (startLon === endLon && startLat === endLat) {
    return ring.slice(0, -1);
  }
  return ring;
}

function addVectorLayers(map: MapLibreMap) {
  if (!map.getSource("regions")) {
    map.addSource("regions", { type: "geojson", data: REGIONS_DATA as GeoJSON.GeoJSON });
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
  if (!map.getSource("waypoints")) {
    map.addSource("waypoints", { type: "geojson", data: WAYPOINTS as GeoJSON.GeoJSON });
  }
  if (!map.getLayer("waypoints-circle")) {
    map.addLayer({
      id: "waypoints-circle",
      type: "circle",
      source: "waypoints",
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

function featureBounds(
  feature: RegionFeature | GeoJSON.Polygon | GeoJSON.MultiPolygon,
): maplibregl.LngLatBoundsLike | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const update = (lon: number, lat: number) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  };

  const geometry = "geometry" in feature ? feature.geometry : feature;
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const [lon, lat] of ring) {
        update(lon, lat);
      }
    }
  } else {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          update(lon, lat);
        }
      }
    }
  }

  if (!Number.isFinite(minLon)) {
    return null;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function clickedFeatureKey(feature: GeoJSON.Feature): string {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  if (typeof properties.iso_a3 === "string") {
    return properties.iso_a3;
  }
  if (typeof properties.name === "string") {
    return properties.name;
  }
  const id = feature.id;
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }
  return "";
}

function regionSlug(feature: GeoJSON.Feature): string {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const raw =
    (typeof properties.name === "string" && properties.name) ||
    (typeof properties.iso_a3 === "string" && properties.iso_a3) ||
    clickedFeatureKey(feature);
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function polygonsFromGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): PolygonRings[] {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as PolygonRings];
  }
  return geometry.coordinates as PolygonRings[];
}

type DebugSnapshot = {
  zoom: number;
  centerLon: number;
  centerLat: number;
  source: string;
};

export default function MapView() {
  const processedMapContainerRef = useRef<HTMLDivElement | null>(null);
  const normalMapContainerRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const processedMapRef = useRef<MapLibreMap | null>(null);
  const normalMapRef = useRef<MapLibreMap | null>(null);
  const activeRegionKeyRef = useRef<string | null>(null);
  const isProgrammaticCameraRef = useRef(false);

  const [debug, setDebug] = useState<DebugSnapshot>({
    zoom: INITIAL_ZOOM,
    centerLon: INITIAL_CENTER[0],
    centerLat: INITIAL_CENTER[1],
    source: "NASA",
  });
  const [activeRegionKey, setActiveRegionKey] = useState<string | null>(null);

  const regionFeaturesByKey = useMemo(() => {
    const map = new Map<string, RegionFeature>();
    for (const feature of REGIONS_DATA.features) {
      map.set(clickedFeatureKey(feature as GeoJSON.Feature), feature as RegionFeature);
    }
    return map;
  }, []);

  const regionKeyBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      map.set(regionSlug(feature as GeoJSON.Feature), key);
    }
    return map;
  }, []);

  const regionSlugByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      map.set(key, regionSlug(feature as GeoJSON.Feature));
    }
    return map;
  }, []);

  const regionLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      map.set(key, typeof properties.name === "string" ? properties.name : key);
    }
    return map;
  }, []);

  const regionPolygons = useMemo<PolygonRings[]>(() => {
    const polygons: PolygonRings[] = [];
    for (const feature of REGIONS_DATA.features) {
      for (const polygon of polygonsFromGeometry(feature.geometry)) {
        polygons.push(polygon);
      }
    }
    return polygons;
  }, []);

  const regionPolygonsByKey = useMemo(() => {
    const map = new Map<string, PolygonRings[]>();
    for (const feature of REGIONS_DATA.features) {
      const key = clickedFeatureKey(feature as GeoJSON.Feature);
      map.set(key, polygonsFromGeometry(feature.geometry));
    }
    return map;
  }, []);

  useEffect(() => {
    const processedContainer = processedMapContainerRef.current;
    const normalContainer = normalMapContainerRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!processedContainer || !normalContainer || !maskCanvas) {
      return;
    }

    const processedMap = new maplibregl.Map({
      container: processedContainer,
      style: createMapStyle(toLocalTileTemplate()),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      interactive: false,
      attributionControl: false,
      maxZoom: 11,
      minZoom: 1.6,
      renderWorldCopies: false,
    });
    const normalMap = new maplibregl.Map({
      container: normalContainer,
      style: createMapStyle(toLocalTileTemplate()),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
      maxZoom: 11,
      minZoom: 1.6,
      renderWorldCopies: false,
    });

    processedMapRef.current = processedMap;
    normalMapRef.current = normalMap;

    let synchronizing = false;
    const syncProcessedMap = () => {
      if (synchronizing || !processedMapRef.current || !normalMapRef.current) {
        return;
      }
      synchronizing = true;
      const liveMap = normalMapRef.current;
      processedMapRef.current.jumpTo({
        center: liveMap.getCenter(),
        zoom: liveMap.getZoom(),
        pitch: liveMap.getPitch(),
        bearing: liveMap.getBearing(),
      });
      synchronizing = false;
    };

    const setDebugSnapshot = () => {
      const map = normalMapRef.current;
      if (!map) {
        return;
      }
      const zoom = map.getZoom();
      const center = map.getCenter();
      const usingLocal = zoom >= Z_HI && inBbox(center.lng, center.lat, FRANCE_BBOX);
      setDebug({
        zoom,
        centerLon: center.lng,
        centerLat: center.lat,
        source: usingLocal ? "Local France + NASA fallback" : "NASA",
      });
    };

    const setHashForRegion = (key: string | null) => {
      const slug = key ? regionSlugByKey.get(key) : "";
      const nextHash = slug ? `#${slug}` : "";
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
        window.history.replaceState(null, "", nextUrl);
      }
    };

    const setOutlineFocusFilter = (key: string | null) => {
      const outlineFilter: maplibregl.FilterSpecification | null = key
        ? (["==", ["get", "iso_a3"], key] as maplibregl.FilterSpecification)
        : null;
      for (const map of [normalMapRef.current, processedMapRef.current]) {
        if (map?.getLayer("regions-outline")) {
          map.setFilter("regions-outline", outlineFilter);
        }
      }
    };

    let gl: WebGLRenderingContext | null = null;
    let glProgram: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let positionAttribLocation = -1;
    const featherCanvas = document.createElement("canvas");
    const featherCtx = featherCanvas.getContext("2d");

    const createMaskProgram = () => {
      gl = maskCanvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) {
        return;
      }

      const vertexShaderSource = `
        attribute vec2 a_position;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;
      const fragmentShaderSource = `
        precision mediump float;
        void main() {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
      `;

      const createShader = (type: number, source: string) => {
        if (!gl) {
          return null;
        }
        const shader = gl.createShader(type);
        if (!shader) {
          return null;
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
      if (!vertexShader || !fragmentShader) {
        return;
      }
      glProgram = gl.createProgram();
      if (!glProgram) {
        return;
      }
      gl.attachShader(glProgram, vertexShader);
      gl.attachShader(glProgram, fragmentShader);
      gl.linkProgram(glProgram);
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        gl.deleteProgram(glProgram);
        glProgram = null;
        return;
      }

      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      positionBuffer = gl.createBuffer();
      positionAttribLocation = gl.getAttribLocation(glProgram, "a_position");
    };

    const renderMask = () => {
      const map = normalMapRef.current;
      if (!map || !gl || !glProgram || !positionBuffer || positionAttribLocation < 0) {
        return;
      }

      const widthCss = normalContainer.clientWidth;
      const heightCss = normalContainer.clientHeight;
      if (widthCss < 2 || heightCss < 2) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const widthPixels = Math.max(1, Math.floor(widthCss * dpr));
      const heightPixels = Math.max(1, Math.floor(heightCss * dpr));
      if (maskCanvas.width !== widthPixels || maskCanvas.height !== heightPixels) {
        maskCanvas.width = widthPixels;
        maskCanvas.height = heightPixels;
        featherCanvas.width = widthPixels;
        featherCanvas.height = heightPixels;
      }

      const focusedKey = activeRegionKeyRef.current;
      const polygons = focusedKey ? (regionPolygonsByKey.get(focusedKey) ?? regionPolygons) : regionPolygons;

      const clipVertices: number[] = [];
      for (const polygon of polygons) {
        const flattenedPoints: number[] = [];
        const holeIndexes: number[] = [];
        let vertexCount = 0;

        for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
          const cleanedRing = normalizeRing(polygon[ringIndex]);
          if (cleanedRing.length < 3) {
            continue;
          }
          if (ringIndex > 0) {
            holeIndexes.push(vertexCount);
          }
          for (const [lon, lat] of cleanedRing) {
            const screen = map.project([lon, lat]);
            flattenedPoints.push(screen.x * dpr, screen.y * dpr);
            vertexCount += 1;
          }
        }

        if (vertexCount < 3) {
          continue;
        }

        const triangles = earcut(flattenedPoints, holeIndexes, 2);
        for (const triangleIndex of triangles) {
          const px = flattenedPoints[triangleIndex * 2];
          const py = flattenedPoints[triangleIndex * 2 + 1];
          clipVertices.push((px / widthPixels) * 2 - 1, 1 - (py / heightPixels) * 2);
        }
      }

      gl.viewport(0, 0, widthPixels, heightPixels);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (clipVertices.length === 0) {
        normalContainer.style.maskImage = "none";
        normalContainer.style.webkitMaskImage = "none";
        return;
      }

      gl.useProgram(glProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(clipVertices), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(positionAttribLocation);
      gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, clipVertices.length / 2);

      let maskUrl = maskCanvas.toDataURL("image/png");
      if (featherCtx) {
        featherCtx.clearRect(0, 0, widthPixels, heightPixels);
        featherCtx.filter = "blur(1.75px)";
        featherCtx.drawImage(maskCanvas, 0, 0, widthPixels, heightPixels);
        featherCtx.filter = "none";
        maskUrl = featherCanvas.toDataURL("image/png");
      }
      normalContainer.style.maskImage = `url("${maskUrl}")`;
      normalContainer.style.maskSize = "100% 100%";
      normalContainer.style.maskRepeat = "no-repeat";
      normalContainer.style.maskPosition = "center";
      normalContainer.style.webkitMaskImage = `url("${maskUrl}")`;
      normalContainer.style.webkitMaskSize = "100% 100%";
      normalContainer.style.webkitMaskRepeat = "no-repeat";
      normalContainer.style.webkitMaskPosition = "center";
    };

    const setFocusedRegion = (key: string | null, updateHash: boolean) => {
      activeRegionKeyRef.current = key;
      setActiveRegionKey(key);
      setOutlineFocusFilter(key);
      renderMask();
      if (updateHash) {
        setHashForRegion(key);
      }
    };

    const runProgrammaticCamera = (move: () => void, fallbackMs: number) => {
      isProgrammaticCameraRef.current = true;
      let settled = false;
      const settle = () => {
        if (settled) {
          return;
        }
        settled = true;
        isProgrammaticCameraRef.current = false;
      };
      normalMap.once("moveend", settle);
      window.setTimeout(settle, fallbackMs);
      move();
    };

    const focusOutToRoot = (updateHash: boolean, duration = 650) => {
      setFocusedRegion(null, updateHash);
      runProgrammaticCamera(() => {
        normalMap.easeTo({
          center: INITIAL_CENTER as LngLatLike,
          zoom: INITIAL_ZOOM,
          duration,
        });
      }, duration + 120);
    };

    const focusRegionByKey = (key: string, updateHash: boolean, duration = 850) => {
      const feature = regionFeaturesByKey.get(key);
      if (!feature) {
        return;
      }
      setFocusedRegion(key, updateHash);
      const bounds = featureBounds(feature);
      if (!bounds) {
        return;
      }
      runProgrammaticCamera(() => {
        normalMap.fitBounds(bounds, {
          padding: { top: 56, right: 56, bottom: 56, left: 56 },
          duration,
          maxZoom: 6.2,
        });
      }, duration + 120);
    };

    const applyFocusFromHash = () => {
      const slug = window.location.hash.replace(/^#/, "").trim().toLowerCase();
      if (!slug) {
        if (activeRegionKeyRef.current) {
          focusOutToRoot(false, 650);
        } else {
          setFocusedRegion(null, false);
        }
        return;
      }
      const key = regionKeyBySlug.get(slug) ?? null;
      if (!key) {
        if (activeRegionKeyRef.current) {
          focusOutToRoot(false, 650);
        } else {
          setFocusedRegion(null, false);
        }
        return;
      }
      focusRegionByKey(key, false, 650);
    };

    const onNormalMapReady = () => {
      addVectorLayers(normalMap);
      normalMap.on("click", "regions-hit-fill", onRegionClick);
      normalMap.on("mouseenter", "regions-hit-fill", onRegionMouseEnter);
      normalMap.on("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      applyFocusFromHash();
      renderMask();
      setDebugSnapshot();
    };
    const onProcessedMapReady = () => {
      addVectorLayers(processedMap);
    };

    const onRegionClick = (event: maplibregl.MapLayerMouseEvent) => {
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
      if (!clicked) {
        return;
      }
      const key = clickedFeatureKey(clicked as GeoJSON.Feature);
      if (!regionFeaturesByKey.has(key)) {
        return;
      }
      focusRegionByKey(key, true, 850);
    };
    const onRegionMouseEnter = () => {
      normalMap.getCanvas().style.cursor = "pointer";
    };
    const onRegionMouseLeave = () => {
      normalMap.getCanvas().style.cursor = "";
    };
    let zoomStart = 0;
    const onZoomStart = () => {
      zoomStart = normalMap.getZoom();
    };
    const onZoomEnd = () => {
      if (!activeRegionKeyRef.current) {
        return;
      }
      if (isProgrammaticCameraRef.current) {
        return;
      }
      const zoomEnd = normalMap.getZoom();
      if (zoomEnd < zoomStart - 0.01) {
        focusOutToRoot(true, 650);
      }
    };

    processedMap.on("load", onProcessedMapReady);
    normalMap.on("load", onNormalMapReady);
    normalMap.on("move", syncProcessedMap);
    normalMap.on("move", setDebugSnapshot);
    normalMap.on("zoomstart", onZoomStart);
    normalMap.on("zoomend", onZoomEnd);
    normalMap.on("render", renderMask);
    normalMap.on("resize", renderMask);
    window.addEventListener("hashchange", applyFocusFromHash);
    window.addEventListener("resize", renderMask);

    createMaskProgram();

    return () => {
      window.removeEventListener("resize", renderMask);
      window.removeEventListener("hashchange", applyFocusFromHash);

      normalMap.off("load", onNormalMapReady);
      processedMap.off("load", onProcessedMapReady);
      if (normalMap.getLayer("regions-hit-fill")) {
        normalMap.off("click", "regions-hit-fill", onRegionClick);
        normalMap.off("mouseenter", "regions-hit-fill", onRegionMouseEnter);
        normalMap.off("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      }
      normalMap.off("move", syncProcessedMap);
      normalMap.off("move", setDebugSnapshot);
      normalMap.off("zoomstart", onZoomStart);
      normalMap.off("zoomend", onZoomEnd);
      normalMap.off("render", renderMask);
      normalMap.off("resize", renderMask);

      normalMap.remove();
      processedMap.remove();
      normalMapRef.current = null;
      processedMapRef.current = null;

      if (gl && positionBuffer) {
        gl.deleteBuffer(positionBuffer);
      }
      if (gl && glProgram) {
        gl.deleteProgram(glProgram);
      }
      normalContainer.style.maskImage = "none";
      normalContainer.style.webkitMaskImage = "none";
    };
  }, [regionFeaturesByKey, regionKeyBySlug, regionPolygons, regionPolygonsByKey, regionSlugByKey]);

  return (
    <div className="app-shell">
      <div className="map-stack">
        <div ref={processedMapContainerRef} className="map map-processed" />
        <div ref={normalMapContainerRef} className="map map-normal" />
        <canvas ref={maskCanvasRef} className="mask-canvas" aria-hidden="true" />
      </div>

      <div className="hud">
        <div className="debug-item">
          <span>Zoom:</span>
          <strong>{debug.zoom.toFixed(2)}</strong>
        </div>
        <div className="debug-item">
          <span>Center:</span>
          <strong>
            {debug.centerLon.toFixed(4)}, {debug.centerLat.toFixed(4)}
          </strong>
        </div>
        <div className="debug-item">
          <span>Tile source:</span>
          <strong>{debug.source}</strong>
        </div>
        <div className="debug-item">
          <span>Focused:</span>
          <strong>{activeRegionKey ? regionLabelByKey.get(activeRegionKey) ?? activeRegionKey : "None"}</strong>
        </div>
        <div className="debug-item muted">
          <span>
            Local threshold z{Z_HI} (Z_BASE={Z_BASE}, +{HI_Z_DELTA})
          </span>
        </div>
      </div>

      <div className="attribution-chip">
        <a href="https://gibs.earthdata.nasa.gov/" target="_blank" rel="noreferrer">
          Imagery: NASA GIBS
        </a>
        <span>|</span>
        <a href="https://maplibre.org/" target="_blank" rel="noreferrer">
          MapLibre
        </a>
      </div>
    </div>
  );
}
