import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  setMaxParallelImageRequests,
  type LngLatLike,
  type Map as MapLibreMap,
} from "maplibre-gl";
import {
  FRANCE_BBOX,
  HI_Z_DELTA,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  SUBREGION_HI_Z_DELTA,
  SUBREGION_MID_Z_DELTA,
  Z_BASE,
  Z_HI,
  Z_SUBREGION_HI,
  Z_SUBREGION_MID,
} from "./config";
import {
  createMapStyle,
  toLocalTileTemplate,
  toSubregionLocalTileTemplate,
  toSubregionMidLocalTileTemplate,
} from "./lib/mapStyle";
import { createRuntimeMap } from "./lib/mapFactory";
import {
  buildDetailWaypoints,
  buildExplicitWaypoints,
  buildSubregionWaypoints,
  mergeWaypoints,
} from "./lib/waypoints";
import { clickedFeatureKey, type PolygonRings } from "./lib/geo";
import {
  buildFocusGraph,
  hashForFocus,
  resolveHashToFocusNode,
  type FocusNode,
} from "./lib/focus";
import { loadRuntimeData, type RuntimeData } from "./lib/data";
import {
  addDetailLayers,
  addFocusMaskLayers,
  addSubregionLayers,
  addVectorLayers,
  setFocusMaskData,
} from "./lib/layers";
import { describeTileSource, hasMeaningfulDebugDelta, type DebugSnapshot } from "./lib/debug";
import {
  buildPolygonsBySlug,
  buildRegionLabelByKey,
  buildRegionPolygonsByKey,
  collectBboxes,
  collectRegionPolygons,
  findRegionBoundsByKey,
  mergeBboxes,
} from "./lib/regionIndex";
import {
  deriveActiveFocusState,
  populateFocusThresholdsForChain,
  pruneFocusThresholds,
  shouldPopFocusOnZoomOut,
} from "./lib/focusState";
import {
  applyDetailVisibility,
  applyOutlineFocusFilter,
  applySubregionVisibility,
  hasDetailChildren,
} from "./lib/layerVisibility";
import { selectMaskPolygons } from "./lib/maskSelection";
import { toFocusEdgeData, toFocusMaskData } from "./lib/focusMask";
import { applyWaypointLayerState, computeWaypointLayerState } from "./lib/waypointVisibility";

const WAYPOINTS_MAX_ZOOM = 4.6;
const UNFOCUS_ZOOM_LEEWAY = 0.35;

export default function MapView() {
  const basePath = import.meta.env.BASE_URL;
  const [runtimeData, setRuntimeData] = useState<RuntimeData | null>(null);
  const [runtimeDataError, setRuntimeDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRuntimeData()
      .then((data) => {
        if (!cancelled) {
          setRuntimeData(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setRuntimeDataError(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const REGIONS_DATA = runtimeData?.regions ?? null;
  const WINE_SUBREGIONS_DATA = runtimeData?.subregions ?? null;
  const WINE_DETAIL_SUBREGIONS_DATA = runtimeData?.details ?? null;
  const BURGUNDY_WAYPOINTS = runtimeData?.explicitWaypoints ?? null;

  const waypoints = useMemo(
    () =>
      mergeWaypoints([
        buildSubregionWaypoints(WINE_SUBREGIONS_DATA ? [WINE_SUBREGIONS_DATA] : []),
        buildDetailWaypoints(WINE_DETAIL_SUBREGIONS_DATA ? [WINE_DETAIL_SUBREGIONS_DATA] : []),
        buildExplicitWaypoints(BURGUNDY_WAYPOINTS ? [BURGUNDY_WAYPOINTS] : []),
      ]),
    [WINE_SUBREGIONS_DATA, WINE_DETAIL_SUBREGIONS_DATA, BURGUNDY_WAYPOINTS],
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activeFocusNodeIdRef = useRef<string | null>(null);
  const activeRegionKeyRef = useRef<string | null>(null);
  const activeSubregionSlugRef = useRef<string | null>(null);
  const activeDetailSlugRef = useRef<string | null>(null);
  const focusZoomByNodeIdRef = useRef<Map<string, number>>(new Map());
  const zoomGestureStartRef = useRef<number | null>(null);
  const isProgrammaticCameraRef = useRef(false);
  const lastWaypointStyleSignatureRef = useRef<string>("");
  const debugRafRef = useRef<number | null>(null);
  const lastDebugSnapshotRef = useRef<DebugSnapshot | null>(null);

  const [debug, setDebug] = useState<DebugSnapshot>({
    zoom: INITIAL_ZOOM,
    centerLon: INITIAL_CENTER[0],
    centerLat: INITIAL_CENTER[1],
    source: "NASA",
  });
  const [activeRegionKey, setActiveRegionKey] = useState<string | null>(null);
  const [activeSubregionSlug, setActiveSubregionSlug] = useState<string | null>(null);
  const [activeDetailSlug, setActiveDetailSlug] = useState<string | null>(null);

  const regionLabelByKey = useMemo(
    () => (REGIONS_DATA ? buildRegionLabelByKey(REGIONS_DATA) : new Map<string, string>()),
    [REGIONS_DATA],
  );
  const regionPolygons = useMemo<PolygonRings[]>(
    () => (REGIONS_DATA ? collectRegionPolygons(REGIONS_DATA) : []),
    [REGIONS_DATA],
  );
  const regionPolygonsByKey = useMemo(
    () => (REGIONS_DATA ? buildRegionPolygonsByKey(REGIONS_DATA) : new Map<string, PolygonRings[]>()),
    [REGIONS_DATA],
  );
  const subregionPolygonsBySlug = useMemo(
    () =>
      WINE_SUBREGIONS_DATA
        ? buildPolygonsBySlug(WINE_SUBREGIONS_DATA)
        : new Map<string, PolygonRings[]>(),
    [WINE_SUBREGIONS_DATA],
  );
  const subregionBounds = useMemo<Array<[number, number, number, number]>>(
    () => (WINE_SUBREGIONS_DATA ? collectBboxes(WINE_SUBREGIONS_DATA) : []),
    [WINE_SUBREGIONS_DATA],
  );
  const detailPolygonsBySlug = useMemo(
    () =>
      WINE_DETAIL_SUBREGIONS_DATA
        ? buildPolygonsBySlug(WINE_DETAIL_SUBREGIONS_DATA)
        : new Map<string, PolygonRings[]>(),
    [WINE_DETAIL_SUBREGIONS_DATA],
  );

  const {
    focusNodeById,
    focusChildrenByParentId,
    regionNodeIdByKey,
    subregionNodeIdBySlug,
    detailNodeIdBySlug,
  } = useMemo(
    () =>
      REGIONS_DATA && WINE_SUBREGIONS_DATA && WINE_DETAIL_SUBREGIONS_DATA
        ? buildFocusGraph(REGIONS_DATA, WINE_SUBREGIONS_DATA, WINE_DETAIL_SUBREGIONS_DATA, Z_SUBREGION_HI)
        : {
            focusNodeById: new Map<string, FocusNode>(),
            focusChildrenByParentId: new Map<string, string[]>(),
            regionNodeIdByKey: new Map<string, string>(),
            subregionNodeIdBySlug: new Map<string, string>(),
            detailNodeIdBySlug: new Map<string, string>(),
          },
    [REGIONS_DATA, WINE_SUBREGIONS_DATA, WINE_DETAIL_SUBREGIONS_DATA],
  );

  const franceLocalBounds = useMemo<[number, number, number, number]>(() => {
    if (!REGIONS_DATA) {
      return FRANCE_BBOX;
    }
    return findRegionBoundsByKey(REGIONS_DATA, "FRA") ?? FRANCE_BBOX;
  }, [REGIONS_DATA]);

  const wineRegionBounds = useMemo<[number, number, number, number]>(
    () => mergeBboxes(subregionBounds, FRANCE_BBOX),
    [subregionBounds],
  );

  useEffect(() => {
    if (!REGIONS_DATA || !WINE_SUBREGIONS_DATA || !WINE_DETAIL_SUBREGIONS_DATA) {
      return;
    }
    const container = mapContainerRef.current;
    if (!container) {
      return;
    }

    setMaxParallelImageRequests(48);

    const map = createRuntimeMap({
      container,
      style: createMapStyle(
        toLocalTileTemplate(basePath),
        toSubregionMidLocalTileTemplate(basePath),
        toSubregionLocalTileTemplate(basePath),
        {
          franceBounds: franceLocalBounds,
          wineRegionBounds,
        },
      ),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      interactive: true,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
    });
    mapRef.current = map;

    const setDebugSnapshot = () => {
      const currentMap = mapRef.current;
      if (!currentMap) {
        return;
      }
      const zoom = currentMap.getZoom();
      const center = currentMap.getCenter();
      const nextDebug: DebugSnapshot = {
        zoom,
        centerLon: center.lng,
        centerLat: center.lat,
        source: describeTileSource(
          zoom,
          center.lng,
          center.lat,
          franceLocalBounds,
          subregionBounds,
          Z_HI,
          Z_SUBREGION_MID,
          Z_SUBREGION_HI,
        ),
      };
      const prevDebug = lastDebugSnapshotRef.current;
      if (!hasMeaningfulDebugDelta(prevDebug, nextDebug)) {
        return;
      }
      lastDebugSnapshotRef.current = nextDebug;
      setDebug(nextDebug);
    };

    const scheduleDebugSnapshot = () => {
      if (debugRafRef.current != null) {
        return;
      }
      debugRafRef.current = window.requestAnimationFrame(() => {
        debugRafRef.current = null;
        setDebugSnapshot();
      });
    };

    const setWaypointVisibility = (nodeId: string | null) => {
      const currentMap = mapRef.current;
      if (!currentMap) {
        return;
      }
      const node = nodeId ? focusNodeById.get(nodeId) ?? null : null;
      const state = computeWaypointLayerState(node, currentMap.getZoom(), WAYPOINTS_MAX_ZOOM);
      if (lastWaypointStyleSignatureRef.current === state.signature) {
        return;
      }
      lastWaypointStyleSignatureRef.current = state.signature;
      applyWaypointLayerState(currentMap, state);
    };

    const setHashForFocus = () => {
      const nextHash = hashForFocus(activeFocusNodeIdRef.current, focusNodeById);
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
        window.history.replaceState(null, "", nextUrl);
      }
    };

    const updateFocusMaskFromState = () => {
      const currentMap = mapRef.current;
      if (!currentMap) {
        return;
      }
      const selectedPolygons = selectMaskPolygons({
        activeRegionKey: activeRegionKeyRef.current,
        activeSubregionSlug: activeSubregionSlugRef.current,
        activeDetailSlug: activeDetailSlugRef.current,
        allRegionPolygons: regionPolygons,
        regionPolygonsByKey,
        subregionPolygonsBySlug,
        detailPolygonsBySlug,
      });
      setFocusMaskData(currentMap, toFocusMaskData(selectedPolygons), toFocusEdgeData(selectedPolygons));
    };

    const runProgrammaticCamera = (move: () => void, fallbackMs: number, onSettled?: () => void) => {
      isProgrammaticCameraRef.current = true;
      let settled = false;
      const settle = () => {
        if (settled) {
          return;
        }
        settled = true;
        isProgrammaticCameraRef.current = false;
        onSettled?.();
      };
      map.once("moveend", settle);
      window.setTimeout(settle, fallbackMs);
      move();
    };

    const setFocusState = (nodeId: string | null, updateHash: boolean) => {
      const nextFocus = deriveActiveFocusState(nodeId, focusNodeById);
      activeFocusNodeIdRef.current = nextFocus.nodeId;
      activeRegionKeyRef.current = nextFocus.regionKey;
      activeSubregionSlugRef.current = nextFocus.subregionSlug;
      activeDetailSlugRef.current = nextFocus.detailSlug;

      pruneFocusThresholds(focusZoomByNodeIdRef.current, nextFocus.nodeId, focusNodeById);

      setActiveRegionKey(nextFocus.regionKey);
      setActiveSubregionSlug(nextFocus.subregionSlug);
      setActiveDetailSlug(nextFocus.detailSlug);

      applyOutlineFocusFilter([mapRef.current], nextFocus.regionKey);
      applySubregionVisibility(mapRef.current, nextFocus.regionKey);
      const detailVisible = hasDetailChildren(
        nextFocus.subregionSlug,
        subregionNodeIdBySlug,
        focusChildrenByParentId,
        focusNodeById,
      );
      applyDetailVisibility(mapRef.current, nextFocus.subregionSlug, detailVisible);
      updateFocusMaskFromState();
      setWaypointVisibility(nextFocus.nodeId);
      scheduleDebugSnapshot();
      if (updateHash) {
        setHashForFocus();
      }
    };

    const computeFitZoom = (node: FocusNode): number | null => {
      const camera = map.cameraForBounds(node.bounds, {
        padding: node.fitPadding,
        maxZoom: node.fitMaxZoom,
      });
      if (!camera || typeof camera.zoom !== "number") {
        return null;
      }
      return camera.zoom;
    };

    const focusNodeByIdWithFit = (nodeId: string, updateHash: boolean, duration = 700) => {
      const node = focusNodeById.get(nodeId);
      if (!node) {
        return;
      }
      populateFocusThresholdsForChain(node.id, focusNodeById, computeFitZoom, focusZoomByNodeIdRef.current);
      setFocusState(node.id, updateHash);
      runProgrammaticCamera(() => {
        map.fitBounds(node.bounds, {
          padding: node.fitPadding,
          duration,
          maxZoom: node.fitMaxZoom,
        });
      }, duration + 120, () => {
        focusZoomByNodeIdRef.current.set(node.id, map.getZoom());
      });
    };

    const applyFocusFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
      if (!hash) {
        setFocusState(null, false);
        return;
      }
      const nodeId = resolveHashToFocusNode(hash, focusChildrenByParentId, focusNodeById);
      if (!nodeId) {
        setFocusState(null, false);
        return;
      }
      focusNodeByIdWithFit(nodeId, false, 650);
    };

    const onRegionClick = (event: maplibregl.MapLayerMouseEvent) => {
      const clicked = event.features?.[0] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined;
      if (!clicked) {
        return;
      }
      const key = clickedFeatureKey(clicked as GeoJSON.Feature);
      const nodeId = regionNodeIdByKey.get(key);
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 850);
    };

    const onSubregionClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (!activeRegionKeyRef.current) {
        return;
      }
      const clicked = event.features?.[0] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined;
      if (!clicked) {
        return;
      }
      const props = (clicked.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      const parentIso = typeof props.parent_iso_a3 === "string" ? props.parent_iso_a3 : "";
      if (parentIso !== activeRegionKeyRef.current) {
        return;
      }
      const nodeId = subregionNodeIdBySlug.get(slug);
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 700);
    };

    const onDetailClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (!activeSubregionSlugRef.current) {
        return;
      }
      const clicked = event.features?.[0] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined;
      if (!clicked) {
        return;
      }
      const props = (clicked.properties ?? {}) as Record<string, unknown>;
      const slug = typeof props.slug === "string" ? props.slug : "";
      const parentSlug = typeof props.parent_slug === "string" ? props.parent_slug : "";
      if (parentSlug !== activeSubregionSlugRef.current) {
        return;
      }
      const nodeId = detailNodeIdBySlug.get(slug);
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 650);
    };

    const onRegionMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onRegionMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    const onZoomStart = () => {
      if (isProgrammaticCameraRef.current) {
        return;
      }
      zoomGestureStartRef.current = map.getZoom();
    };

    const onZoomEnd = () => {
      if (isProgrammaticCameraRef.current) {
        return;
      }
      const startZoom = zoomGestureStartRef.current;
      zoomGestureStartRef.current = null;
      if (startZoom == null) {
        return;
      }
      const endZoom = map.getZoom();
      const decision = shouldPopFocusOnZoomOut(
        startZoom,
        endZoom,
        activeFocusNodeIdRef.current,
        focusNodeById,
        focusZoomByNodeIdRef.current,
        UNFOCUS_ZOOM_LEEWAY,
      );
      if (!decision.pop) {
        setWaypointVisibility(activeFocusNodeIdRef.current);
        scheduleDebugSnapshot();
        return;
      }
      if (!decision.parentId) {
        setFocusState(null, true);
        return;
      }
      populateFocusThresholdsForChain(
        decision.parentId,
        focusNodeById,
        computeFitZoom,
        focusZoomByNodeIdRef.current,
      );
      setFocusState(decision.parentId, true);
    };

    const onMove = () => {
      setWaypointVisibility(activeFocusNodeIdRef.current);
      scheduleDebugSnapshot();
    };

    const onMoveEnd = () => {
      setWaypointVisibility(activeFocusNodeIdRef.current);
      setDebugSnapshot();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setFocusState(null, true);
      runProgrammaticCamera(() => {
        map.easeTo({
          center: INITIAL_CENTER as LngLatLike,
          zoom: INITIAL_ZOOM,
          duration: 650,
        });
      }, 820);
    };

    const onWindowResize = () => {
      scheduleDebugSnapshot();
    };

    const onMapReady = () => {
      addVectorLayers(map, REGIONS_DATA, waypoints, true);
      addSubregionLayers(map, WINE_SUBREGIONS_DATA);
      addDetailLayers(map, WINE_DETAIL_SUBREGIONS_DATA);
      addFocusMaskLayers(map);
      map.on("click", "regions-hit-fill", onRegionClick);
      map.on("click", "france-subregions-hit-fill", onSubregionClick);
      map.on("click", "burgundy-detail-subregions-hit-fill", onDetailClick);
      map.on("mouseenter", "regions-hit-fill", onRegionMouseEnter);
      map.on("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      applyFocusFromHash();
      updateFocusMaskFromState();
      setWaypointVisibility(activeFocusNodeIdRef.current);
      setDebugSnapshot();
    };

    map.on("load", onMapReady);
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    window.addEventListener("hashchange", applyFocusFromHash);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.removeEventListener("hashchange", applyFocusFromHash);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWindowResize);
      if (debugRafRef.current != null) {
        window.cancelAnimationFrame(debugRafRef.current);
        debugRafRef.current = null;
      }
      map.off("load", onMapReady);
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      if (map.getLayer("regions-hit-fill")) {
        map.off("click", "regions-hit-fill", onRegionClick);
        map.off("click", "france-subregions-hit-fill", onSubregionClick);
        map.off("click", "burgundy-detail-subregions-hit-fill", onDetailClick);
        map.off("mouseenter", "regions-hit-fill", onRegionMouseEnter);
        map.off("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      }
      map.remove();
      mapRef.current = null;
    };
  }, [
    REGIONS_DATA,
    WINE_SUBREGIONS_DATA,
    WINE_DETAIL_SUBREGIONS_DATA,
    detailNodeIdBySlug,
    detailPolygonsBySlug,
    focusChildrenByParentId,
    focusNodeById,
    franceLocalBounds,
    regionNodeIdByKey,
    regionPolygons,
    regionPolygonsByKey,
    subregionBounds,
    subregionNodeIdBySlug,
    subregionPolygonsBySlug,
    waypoints,
    wineRegionBounds,
    basePath,
  ]);

  if (runtimeDataError) {
    return (
      <div className="app-shell">
        <div className="hud">
          <div className="hud-title">Wine Regions Map</div>
          <div className="debug-item">
            <span>Data error:</span>
            <strong>{runtimeDataError}</strong>
          </div>
          <div className="debug-item muted">
            <span>Run `npm run validate:data` to inspect dataset consistency.</span>
          </div>
        </div>
      </div>
    );
  }

  if (!runtimeData) {
    return (
      <div className="app-shell">
        <div className="hud">
          <div className="hud-title">Wine Regions Map</div>
          <div className="debug-item">
            <span className="loading-pulse">Loading map data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="map-stack">
        <div ref={mapContainerRef} className="map map-normal" aria-label="Interactive map" />
      </div>

      <div className="hud">
        <div className="hud-title">Wine Regions Map</div>
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
        <div className="debug-item">
          <span>Sub focus:</span>
          <strong>{activeSubregionSlug ?? "None"}</strong>
        </div>
        <div className="debug-item">
          <span>Detail focus:</span>
          <strong>{activeDetailSlug ?? "None"}</strong>
        </div>
        <div className="debug-item muted">
          <span>
            Local thresholds z{Z_HI}/z{Z_SUBREGION_MID}/z{Z_SUBREGION_HI} (base={Z_BASE}, +{HI_Z_DELTA}, +{SUBREGION_MID_Z_DELTA}, +{SUBREGION_HI_Z_DELTA})
          </span>
        </div>
        <div className="debug-item muted">
          <span>Tips: click to focus, zoom out past focus to go up, press Esc for world view.</span>
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
