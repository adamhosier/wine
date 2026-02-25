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
  SUBREGION_MID_Z_DELTA,
  SUBREGION_HI_Z_DELTA,
  Z_BASE,
  Z_HI,
  Z_SUBREGION_MID,
  Z_SUBREGION_HI,
} from "./config";
import {
  createMapStyle,
  createPoiStyle,
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
import {
  clickedFeatureKey,
  type PolygonRings,
} from "./lib/geo";
import {
  buildFocusGraph,
  hashForFocus,
  resolveHashToFocusNode,
  type FocusNode,
} from "./lib/focus";
import {
  loadRuntimeData,
  type RuntimeData,
} from "./lib/data";
import { addDetailLayers, addSubregionLayers, addVectorLayers } from "./lib/layers";
import { MaskRenderer } from "./lib/maskRenderer";
import { describeTileSource, hasMeaningfulDebugDelta, type DebugSnapshot } from "./lib/debug";
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
import {
  buildPolygonsBySlug,
  buildRegionLabelByKey,
  buildRegionPolygonsByKey,
  collectBboxes,
  collectRegionPolygons,
  findRegionBoundsByKey,
  mergeBboxes,
} from "./lib/regionIndex";
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

  const processedMapContainerRef = useRef<HTMLDivElement | null>(null);
  const normalMapContainerRef = useRef<HTMLDivElement | null>(null);
  const poiMapContainerRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const processedMapRef = useRef<MapLibreMap | null>(null);
  const normalMapRef = useRef<MapLibreMap | null>(null);
  const poiMapRef = useRef<MapLibreMap | null>(null);
  const activeFocusNodeIdRef = useRef<string | null>(null);
  const activeRegionKeyRef = useRef<string | null>(null);
  const activeSubregionSlugRef = useRef<string | null>(null);
  const activeDetailSlugRef = useRef<string | null>(null);
  const focusZoomByNodeIdRef = useRef<Map<string, number>>(new Map());
  const zoomGestureStartRef = useRef<number | null>(null);
  const isProgrammaticCameraRef = useRef(false);
  const maskRendererRef = useRef<MaskRenderer | null>(null);
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

  const burgundyDetailPolygonsBySlug = useMemo(
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

  const wineRegionBounds = useMemo<[number, number, number, number]>(() => {
    return mergeBboxes(subregionBounds, FRANCE_BBOX);
  }, [subregionBounds]);

  useEffect(() => {
    if (!REGIONS_DATA || !WINE_SUBREGIONS_DATA || !WINE_DETAIL_SUBREGIONS_DATA) {
      return;
    }

    const processedContainer = processedMapContainerRef.current;
    const normalContainer = normalMapContainerRef.current;
    const poiContainer = poiMapContainerRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!processedContainer || !normalContainer || !poiContainer || !maskCanvas) {
      return;
    }

    setMaxParallelImageRequests(48);

    const processedMap = createRuntimeMap({
      container: processedContainer,
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
      interactive: false,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
    });
    const normalMap = createRuntimeMap({
      container: normalContainer,
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
    const poiMap = createRuntimeMap({
      container: poiContainer,
      style: createPoiStyle(),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      interactive: false,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
    });

    processedMapRef.current = processedMap;
    normalMapRef.current = normalMap;
    poiMapRef.current = poiMap;

    let synchronizing = false;
    let lastMirrorCameraKey = "";
    const syncMirrorMaps = (force = false) => {
      if (synchronizing || !normalMapRef.current) {
        return;
      }
      synchronizing = true;
      const liveMap = normalMapRef.current;
      const camera = {
        center: liveMap.getCenter(),
        zoom: liveMap.getZoom(),
        pitch: liveMap.getPitch(),
        bearing: liveMap.getBearing(),
      };
      const cameraKey = [
        camera.center.lng.toFixed(6),
        camera.center.lat.toFixed(6),
        camera.zoom.toFixed(6),
        camera.pitch.toFixed(3),
        camera.bearing.toFixed(3),
      ].join("|");
      if (!force && cameraKey === lastMirrorCameraKey) {
        synchronizing = false;
        return;
      }
      lastMirrorCameraKey = cameraKey;
      processedMapRef.current?.jumpTo(camera);
      poiMapRef.current?.jumpTo(camera);
      synchronizing = false;
    };

    const setDebugSnapshot = () => {
      const map = normalMapRef.current;
      if (!map) {
        return;
      }
      const zoom = map.getZoom();
      const center = map.getCenter();
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

    const setWaypointVisibility = (nodeId: string | null) => {
      const map = poiMapRef.current;
      if (!map) {
        return;
      }
      const node = nodeId ? focusNodeById.get(nodeId) ?? null : null;
      const state = computeWaypointLayerState(node, map.getZoom(), WAYPOINTS_MAX_ZOOM);
      if (lastWaypointStyleSignatureRef.current === state.signature) {
        return;
      }
      lastWaypointStyleSignatureRef.current = state.signature;
      applyWaypointLayerState(map, state);
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

    const setHashForFocus = () => {
      const nextHash = hashForFocus(activeFocusNodeIdRef.current, focusNodeById);
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
        window.history.replaceState(null, "", nextUrl);
      }
    };

    const getMaskPolygons = () => {
      return selectMaskPolygons({
        activeRegionKey: activeRegionKeyRef.current,
        activeSubregionSlug: activeSubregionSlugRef.current,
        activeDetailSlug: activeDetailSlugRef.current,
        allRegionPolygons: regionPolygons,
        regionPolygonsByKey,
        subregionPolygonsBySlug,
        detailPolygonsBySlug: burgundyDetailPolygonsBySlug,
      });
    };

    maskRendererRef.current = new MaskRenderer({
      map: normalMap,
      normalContainer,
      maskCanvas,
      getPolygons: getMaskPolygons,
      minRenderIntervalMs: 0,
    });

    const scheduleMaskRender = (withFeather = false) => {
      maskRendererRef.current?.schedule(withFeather);
    };

    let cameraUiRaf: number | null = null;
    let cameraUiNeedsFeather = false;
    const scheduleCameraUiRefresh = (withFeather = false) => {
      cameraUiNeedsFeather = cameraUiNeedsFeather || withFeather;
      if (cameraUiRaf != null) {
        return;
      }
      cameraUiRaf = window.requestAnimationFrame(() => {
        cameraUiRaf = null;
        const shouldFeather = cameraUiNeedsFeather;
        cameraUiNeedsFeather = false;
        setWaypointVisibility(activeFocusNodeIdRef.current);
        scheduleMaskRender(shouldFeather);
        scheduleDebugSnapshot();
      });
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
      normalMap.once("moveend", settle);
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
      applyOutlineFocusFilter([normalMapRef.current, processedMapRef.current], nextFocus.regionKey);
      applySubregionVisibility(normalMapRef.current, nextFocus.regionKey);
      const detailVisible = hasDetailChildren(
        nextFocus.subregionSlug,
        subregionNodeIdBySlug,
        focusChildrenByParentId,
        focusNodeById,
      );
      applyDetailVisibility(normalMapRef.current, nextFocus.subregionSlug, detailVisible);
      scheduleCameraUiRefresh(true);
      if (updateHash) {
        setHashForFocus();
      }
    };

    const computeFitZoom = (node: FocusNode): number | null => {
      const camera = normalMap.cameraForBounds(node.bounds, {
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
        normalMap.fitBounds(node.bounds, {
          padding: node.fitPadding,
          duration,
          maxZoom: node.fitMaxZoom,
        });
      }, duration + 120, () => {
        focusZoomByNodeIdRef.current.set(node.id, normalMap.getZoom());
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

    const onNormalMapReady = () => {
      addVectorLayers(normalMap, REGIONS_DATA, waypoints, false);
      addSubregionLayers(normalMap, WINE_SUBREGIONS_DATA);
      addDetailLayers(normalMap, WINE_DETAIL_SUBREGIONS_DATA);
      normalMap.on("click", "regions-hit-fill", onRegionClick);
      normalMap.on("click", "france-subregions-hit-fill", onSubregionClick);
      normalMap.on("click", "burgundy-detail-subregions-hit-fill", onBurgundyDetailClick);
      normalMap.on("mouseenter", "regions-hit-fill", onRegionMouseEnter);
      normalMap.on("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      applyFocusFromHash();
      scheduleCameraUiRefresh(true);
      setDebugSnapshot();
      syncMirrorMaps(true);
    };
    const onProcessedMapReady = () => {
      addVectorLayers(processedMap, REGIONS_DATA, waypoints, false);
    };
    const onPoiMapReady = () => {
      addVectorLayers(poiMap, REGIONS_DATA, waypoints, true);
      scheduleCameraUiRefresh(false);
    };

    const onRegionClick = (event: maplibregl.MapLayerMouseEvent) => {
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
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
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
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
    const onBurgundyDetailClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (!activeSubregionSlugRef.current) {
        return;
      }
      const clicked = event.features?.[0] as
        | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
        | undefined;
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
      normalMap.getCanvas().style.cursor = "pointer";
    };
    const onRegionMouseLeave = () => {
      normalMap.getCanvas().style.cursor = "";
    };
    const onZoomStart = () => {
      if (isProgrammaticCameraRef.current) {
        return;
      }
      zoomGestureStartRef.current = normalMap.getZoom();
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
      const endZoom = normalMap.getZoom();
      if (endZoom >= startZoom - 0.01) {
        scheduleCameraUiRefresh(false);
        return;
      }
      const shouldPop = shouldPopFocusOnZoomOut(
        startZoom,
        endZoom,
        activeFocusNodeIdRef.current,
        focusNodeById,
        focusZoomByNodeIdRef.current,
        UNFOCUS_ZOOM_LEEWAY,
      );
      if (!shouldPop.pop) {
        scheduleCameraUiRefresh(false);
        return;
      }
      const parentId = shouldPop.parentId;
      if (!parentId) {
        setFocusState(null, true);
        scheduleCameraUiRefresh(true);
        return;
      }
      populateFocusThresholdsForChain(parentId, focusNodeById, computeFitZoom, focusZoomByNodeIdRef.current);
      setFocusState(parentId, true);
      scheduleCameraUiRefresh(true);
    };

    const onMove = () => {
      scheduleDebugSnapshot();
    };
    const onMoveEnd = () => {
      setDebugSnapshot();
      setWaypointVisibility(activeFocusNodeIdRef.current);
      syncMirrorMaps(true);
      scheduleMaskRender(true);
    };
    const onRenderFrame = () => {
      if (!normalMap.isMoving()) {
        return;
      }
      // Keep mirror maps + mask projection in lock-step with the map render loop while interacting.
      syncMirrorMaps();
      maskRendererRef.current?.render(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setFocusState(null, true);
      runProgrammaticCamera(() => {
        normalMap.easeTo({
          center: INITIAL_CENTER as LngLatLike,
          zoom: INITIAL_ZOOM,
          duration: 650,
        });
      }, 820);
    };
    const onWindowResize = () => {
      scheduleCameraUiRefresh(true);
    };

    processedMap.on("load", onProcessedMapReady);
    normalMap.on("load", onNormalMapReady);
    poiMap.on("load", onPoiMapReady);
    normalMap.on("move", onMove);
    normalMap.on("moveend", onMoveEnd);
    normalMap.on("render", onRenderFrame);
    normalMap.on("zoomstart", onZoomStart);
    normalMap.on("zoomend", onZoomEnd);
    window.addEventListener("hashchange", applyFocusFromHash);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("hashchange", applyFocusFromHash);
      window.removeEventListener("keydown", onKeyDown);
      if (debugRafRef.current != null) {
        window.cancelAnimationFrame(debugRafRef.current);
        debugRafRef.current = null;
      }
      if (cameraUiRaf != null) {
        window.cancelAnimationFrame(cameraUiRaf);
        cameraUiRaf = null;
      }

      normalMap.off("load", onNormalMapReady);
      processedMap.off("load", onProcessedMapReady);
      poiMap.off("load", onPoiMapReady);
      if (normalMap.getLayer("regions-hit-fill")) {
        normalMap.off("click", "regions-hit-fill", onRegionClick);
        normalMap.off("click", "france-subregions-hit-fill", onSubregionClick);
        normalMap.off("click", "burgundy-detail-subregions-hit-fill", onBurgundyDetailClick);
        normalMap.off("mouseenter", "regions-hit-fill", onRegionMouseEnter);
        normalMap.off("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      }
      normalMap.off("move", onMove);
      normalMap.off("moveend", onMoveEnd);
      normalMap.off("render", onRenderFrame);
      normalMap.off("zoomstart", onZoomStart);
      normalMap.off("zoomend", onZoomEnd);

      maskRendererRef.current?.destroy();
      maskRendererRef.current = null;
      normalMap.remove();
      processedMap.remove();
      poiMap.remove();
      normalMapRef.current = null;
      processedMapRef.current = null;
      poiMapRef.current = null;
    };
  }, [
    REGIONS_DATA,
    WINE_SUBREGIONS_DATA,
    WINE_DETAIL_SUBREGIONS_DATA,
    franceLocalBounds,
    wineRegionBounds,
    burgundyDetailPolygonsBySlug,
    detailNodeIdBySlug,
    focusChildrenByParentId,
    focusNodeById,
    regionPolygons,
    regionPolygonsByKey,
    regionNodeIdByKey,
    subregionBounds,
    subregionNodeIdBySlug,
    subregionPolygonsBySlug,
    waypoints,
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
        <div ref={processedMapContainerRef} className="map map-processed" aria-hidden="true" />
        <div ref={normalMapContainerRef} className="map map-normal" aria-label="Interactive map" />
        <div ref={poiMapContainerRef} className="map map-poi" aria-hidden="true" />
        <canvas ref={maskCanvasRef} className="mask-canvas" aria-hidden="true" />
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
