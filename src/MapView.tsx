import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  setMaxParallelImageRequests,
  type LngLatLike,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { INITIAL_CENTER, INITIAL_ZOOM, WORLD_BBOX, Z_SUBREGION_HI } from "./config";
import {
  createMapStyle,
  toSubregionLocalTileTemplate,
  toSubregionMidLocalTileTemplate,
} from "./lib/mapStyle";
import { createRuntimeMap } from "./lib/mapFactory";
import {
  buildLeafInfoPoints,
  buildExplicitWaypoints,
  buildHierarchyWaypoints,
  mergeWaypoints,
} from "./lib/waypoints";
import { clickedFeatureKey, polygonsFromGeometry, type PolygonRings } from "./lib/geo";
import {
  buildFocusGraphFromNodes,
  getFocusChain,
  hashForFocus,
  resolveHashToFocusNode,
  type FocusNode,
} from "./lib/focus";
import {
  loadRuntimeData,
  RUNTIME_DATA_SOURCES,
  type RuntimeData,
  type RuntimeDataSourceId,
} from "./lib/data";
import {
  addFocusMaskLayers,
  addHierarchyNodeLayers,
  addVectorLayers,
  bringWaypointLayersToFront,
  setFocusMaskData,
} from "./lib/layers";
import {
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
  applyHierarchyChildrenVisibility,
  applyOutlineFocusFilter,
  hasChildren,
} from "./lib/layerVisibility";
import { selectMaskPolygons } from "./lib/maskSelection";
import { toFocusEdgeData, toFocusMaskData } from "./lib/focusMask";
import { applyWaypointLayerState, computeWaypointLayerState } from "./lib/waypointVisibility";
import { createLeafInfoMarkers, selectVisibleLeafInfoFeatures } from "./lib/leafInfoMarkers";
import { buildQuizPath } from "./lib/appRoute";

const WAYPOINTS_MAX_ZOOM = 4.6;
const UNFOCUS_ZOOM_LEEWAY = 0.35;

export default function MapView() {
  const basePath = import.meta.env.BASE_URL;
  const quizPath = buildQuizPath(basePath);
  const [selectedSourceId, setSelectedSourceId] = useState<RuntimeDataSourceId>("wset-level-2");
  const [runtimeData, setRuntimeData] = useState<RuntimeData | null>(null);
  const [runtimeDataError, setRuntimeDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRuntimeData(null);
    setRuntimeDataError(null);
    loadRuntimeData(selectedSourceId)
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
  }, [selectedSourceId]);

  const ROOT_REGIONS_DATA = runtimeData?.regions ?? null;
  const HIERARCHY_NODES_DATA = runtimeData?.hierarchyNodes ?? null;
  const EXPLICIT_WAYPOINTS_DATA = runtimeData?.explicitWaypoints ?? null;

  const waypoints = useMemo(
    () =>
      mergeWaypoints([
        buildHierarchyWaypoints(HIERARCHY_NODES_DATA ? [HIERARCHY_NODES_DATA] : []),
        buildExplicitWaypoints(EXPLICIT_WAYPOINTS_DATA ? [EXPLICIT_WAYPOINTS_DATA] : []),
      ]),
    [HIERARCHY_NODES_DATA, EXPLICIT_WAYPOINTS_DATA],
  );
  const leafInfoPoints = useMemo(
    () =>
      buildLeafInfoPoints([
        ...(ROOT_REGIONS_DATA ? [ROOT_REGIONS_DATA] : []),
        ...(HIERARCHY_NODES_DATA ? [HIERARCHY_NODES_DATA] : []),
      ]),
    [ROOT_REGIONS_DATA, HIERARCHY_NODES_DATA],
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activeFocusNodeIdRef = useRef<string | null>(null);
  const focusZoomByNodeIdRef = useRef<Map<string, number>>(new Map());
  const zoomGestureStartRef = useRef<number | null>(null);
  const isProgrammaticCameraRef = useRef(false);
  const lastWaypointStyleSignatureRef = useRef<string>("");
  const leafInfoMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [activeFocusPath, setActiveFocusPath] = useState<string>("None");
  const allRootPolygons = useMemo<PolygonRings[]>(
    () => (ROOT_REGIONS_DATA ? collectRegionPolygons(ROOT_REGIONS_DATA) : []),
    [ROOT_REGIONS_DATA],
  );
  const polygonsByNodeId = useMemo(() => {
    const map = new Map<string, PolygonRings[]>();
    if (ROOT_REGIONS_DATA) {
      for (const feature of ROOT_REGIONS_DATA.features) {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const nodeId = typeof props.node_id === "string" ? props.node_id : "";
        if (nodeId) {
          map.set(nodeId, polygonsFromGeometry(feature.geometry));
        }
      }
    }
    if (HIERARCHY_NODES_DATA) {
      for (const feature of HIERARCHY_NODES_DATA.features) {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const nodeId = typeof props.node_id === "string" ? props.node_id : "";
        if (nodeId) {
          map.set(nodeId, polygonsFromGeometry(feature.geometry));
        }
      }
    }
    return map;
  }, [ROOT_REGIONS_DATA, HIERARCHY_NODES_DATA]);
  const subregionBounds = useMemo<Array<[number, number, number, number]>>(
    () => (HIERARCHY_NODES_DATA ? collectBboxes(HIERARCHY_NODES_DATA) : []),
    [HIERARCHY_NODES_DATA],
  );
  const wineRegionBoundsByKey = useMemo<Array<{ key: string; bounds: [number, number, number, number] }>>(() => {
    if (!ROOT_REGIONS_DATA || !HIERARCHY_NODES_DATA) {
      return [];
    }
    const activeRootKeys = new Set<string>();
    for (const feature of HIERARCHY_NODES_DATA.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const parentNodeId = typeof props.parent_node_id === "string" ? props.parent_node_id : "";
      const match = parentNodeId.match(/^region:(.+)$/);
      if (match?.[1]) {
        activeRootKeys.add(match[1]);
      }
    }
    return ROOT_REGIONS_DATA.features
      .map((feature) => ({
        key: clickedFeatureKey(feature as GeoJSON.Feature),
        bounds: findRegionBoundsByKey(ROOT_REGIONS_DATA, clickedFeatureKey(feature as GeoJSON.Feature)),
      }))
      .filter(
        (
          entry,
        ): entry is {
          key: string;
          bounds: [number, number, number, number];
        } => activeRootKeys.has(entry.key) && Boolean(entry.bounds),
      );
  }, [ROOT_REGIONS_DATA, HIERARCHY_NODES_DATA]);

  const {
    focusNodeById,
    focusChildrenByParentId,
    regionNodeIdByKey,
  } = useMemo(
    () => buildFocusGraphFromNodes(runtimeData?.treeNodes ?? []),
    [runtimeData?.treeNodes],
  );
  const rootRegionBounds = useMemo<Array<[number, number, number, number]>>(
    () => (ROOT_REGIONS_DATA ? collectBboxes(ROOT_REGIONS_DATA) : []),
    [ROOT_REGIONS_DATA],
  );
  const leafNodeIds = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const node of runtimeData?.treeNodes ?? []) {
      const key = node.parentId ?? "__root__";
      const bucket = childrenByParent.get(key);
      if (bucket) {
        bucket.push(node.id);
      } else {
        childrenByParent.set(key, [node.id]);
      }
    }
    const leaves = new Set<string>();
    for (const node of runtimeData?.treeNodes ?? []) {
      if (!(childrenByParent.get(node.id) ?? []).length) {
        leaves.add(node.id);
      }
    }
    return leaves;
  }, [runtimeData?.treeNodes]);

  const wineRegionBounds = useMemo<[number, number, number, number]>(
    () => mergeBboxes(subregionBounds, mergeBboxes(rootRegionBounds, WORLD_BBOX)),
    [rootRegionBounds, subregionBounds],
  );

  useEffect(() => {
    if (!ROOT_REGIONS_DATA || !HIERARCHY_NODES_DATA) {
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
        toSubregionMidLocalTileTemplate(basePath),
        toSubregionLocalTileTemplate(basePath),
        {
          wineRegionBounds,
          wineRegionBoundsByKey,
        },
      ),
      center: INITIAL_CENTER as LngLatLike,
      zoom: INITIAL_ZOOM,
      interactive: true,
      maxZoom: Z_SUBREGION_HI + 1,
      minZoom: 1.6,
    });
    mapRef.current = map;

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

    const clearLeafInfoMarkers = () => {
      for (const marker of leafInfoMarkersRef.current) {
        marker.remove();
      }
      leafInfoMarkersRef.current = [];
    };

    const setLeafInfoVisibility = (nodeId: string | null) => {
      const currentMap = mapRef.current;
      if (!currentMap) {
        return;
      }
      clearLeafInfoMarkers();
      const features = selectVisibleLeafInfoFeatures(nodeId, leafNodeIds, leafInfoPoints);
      leafInfoMarkersRef.current = createLeafInfoMarkers(currentMap, features);
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
        activeNodeId: activeFocusNodeIdRef.current,
        allRootPolygons,
        polygonsByNodeId,
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

      pruneFocusThresholds(focusZoomByNodeIdRef.current, nextFocus.nodeId, focusNodeById);

      const focusPath = getFocusChain(nextFocus.nodeId, focusNodeById)
        .map((node) => node.slug)
        .join(" > ");
      setActiveFocusPath(focusPath || "None");

      const rootNodeId = getFocusChain(nextFocus.nodeId, focusNodeById)[0]?.id ?? null;
      applyOutlineFocusFilter([mapRef.current], rootNodeId);
      applyHierarchyChildrenVisibility(
        mapRef.current,
        nextFocus.nodeId,
        hasChildren(nextFocus.nodeId, focusChildrenByParentId),
      );
      updateFocusMaskFromState();
      setWaypointVisibility(nextFocus.nodeId);
      setLeafInfoVisibility(nextFocus.nodeId);
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
      const hierarchyHits = map.queryRenderedFeatures(event.point, {
        layers: ["hierarchy-nodes-hit-fill"],
      });
      if (hierarchyHits.length) {
        return;
      }
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

    const onHierarchyNodeClick = (event: maplibregl.MapLayerMouseEvent) => {
      const clicked = event.features?.[0] as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined;
      if (!clicked) {
        return;
      }
      const props = (clicked.properties ?? {}) as Record<string, unknown>;
      const nodeId = typeof props.node_id === "string" ? props.node_id : "";
      if (!nodeId) {
        return;
      }
      focusNodeByIdWithFit(nodeId, true, 700);
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
        setLeafInfoVisibility(activeFocusNodeIdRef.current);
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
    };

    const onMoveEnd = () => {
      setWaypointVisibility(activeFocusNodeIdRef.current);
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

    const onMapReady = () => {
      addVectorLayers(map, ROOT_REGIONS_DATA, waypoints, true);
      addHierarchyNodeLayers(map, HIERARCHY_NODES_DATA);
      addFocusMaskLayers(map);
      bringWaypointLayersToFront(map);
      map.on("click", "regions-hit-fill", onRegionClick);
      map.on("click", "hierarchy-nodes-hit-fill", onHierarchyNodeClick);
      map.on("mouseenter", "regions-hit-fill", onRegionMouseEnter);
      map.on("mouseenter", "hierarchy-nodes-hit-fill", onRegionMouseEnter);
      map.on("mouseleave", "regions-hit-fill", onRegionMouseLeave);
      map.on("mouseleave", "hierarchy-nodes-hit-fill", onRegionMouseLeave);
      applyFocusFromHash();
      updateFocusMaskFromState();
      setWaypointVisibility(activeFocusNodeIdRef.current);
      setLeafInfoVisibility(activeFocusNodeIdRef.current);
    };

    map.on("load", onMapReady);
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    window.addEventListener("hashchange", applyFocusFromHash);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("hashchange", applyFocusFromHash);
      window.removeEventListener("keydown", onKeyDown);
      map.off("load", onMapReady);
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      if (map.getLayer("regions-hit-fill")) {
        map.off("click", "regions-hit-fill", onRegionClick);
        map.off("click", "hierarchy-nodes-hit-fill", onHierarchyNodeClick);
        map.off("mouseenter", "regions-hit-fill", onRegionMouseEnter);
        map.off("mouseenter", "hierarchy-nodes-hit-fill", onRegionMouseEnter);
        map.off("mouseleave", "regions-hit-fill", onRegionMouseLeave);
        map.off("mouseleave", "hierarchy-nodes-hit-fill", onRegionMouseLeave);
      }
      clearLeafInfoMarkers();
      map.remove();
      mapRef.current = null;
    };
  }, [
    ROOT_REGIONS_DATA,
    HIERARCHY_NODES_DATA,
    allRootPolygons,
    focusChildrenByParentId,
    focusNodeById,
    polygonsByNodeId,
    regionNodeIdByKey,
    rootRegionBounds,
    subregionBounds,
    waypoints,
    leafInfoPoints,
    wineRegionBounds,
    wineRegionBoundsByKey,
    basePath,
    leafNodeIds,
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
        <div className="debug-item">
          <span>Data source:</span>
          <select
            className="source-select"
            value={selectedSourceId}
            onChange={(event) => setSelectedSourceId(event.target.value as RuntimeDataSourceId)}
          >
            {RUNTIME_DATA_SOURCES.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </div>
        <div className="debug-item">
          <span>Path:</span>
          <strong>{activeFocusPath}</strong>
        </div>
        <div className="debug-item muted">
          <span>Tips: click to focus, zoom out past focus to go up, press Esc for world view.</span>
        </div>
        <div className="debug-item muted">
          <a href={quizPath}>Open Quiz</a>
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
