import maplibregl from "maplibre-gl";
import type { WaypointFeatureCollection } from "./waypoints";

type LeafInfoProps = {
  node_id?: unknown;
  parent_node_id?: unknown;
  name?: unknown;
  grape_lines?: unknown;
};

type MarkerAnchor =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type MarkerPlacement = {
  anchor: MarkerAnchor;
  offset: [number, number];
};

const CANDIDATE_PLACEMENTS: MarkerPlacement[] = [
  { anchor: "bottom-left", offset: [14, -10] },
  { anchor: "bottom-right", offset: [-14, -10] },
  { anchor: "top-left", offset: [14, 10] },
  { anchor: "top-right", offset: [-14, 10] },
  { anchor: "right", offset: [16, 0] },
  { anchor: "left", offset: [-16, 0] },
  { anchor: "bottom", offset: [0, -14] },
  { anchor: "top", offset: [0, 14] },
];

type Rect = { left: number; top: number; right: number; bottom: number };

export function selectVisibleLeafInfoFeatures(
  focusNodeId: string | null,
  leafNodeIds: Set<string>,
  leafInfoPoints: WaypointFeatureCollection,
): GeoJSON.Feature<GeoJSON.Point>[] {
  if (!focusNodeId) {
    return [];
  }

  const isLeafFocus = leafNodeIds.has(focusNodeId);
  return leafInfoPoints.features.filter((feature) => {
    const props = (feature.properties ?? {}) as LeafInfoProps;
    const nodeId = typeof props.node_id === "string" ? props.node_id : "";
    const parentNodeId = typeof props.parent_node_id === "string" ? props.parent_node_id : "";
    if (isLeafFocus) {
      return nodeId === focusNodeId;
    }
    return parentNodeId === focusNodeId;
  });
}

export function createLeafInfoMarker(
  map: maplibregl.Map,
  feature: GeoJSON.Feature<GeoJSON.Point>,
  placement: MarkerPlacement = CANDIDATE_PLACEMENTS[0],
): maplibregl.Marker | null {
  const props = (feature.properties ?? {}) as LeafInfoProps;
  const name = typeof props.name === "string" ? props.name : "";
  const lines = Array.isArray(props.grape_lines)
    ? props.grape_lines.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (!name || !lines.length) {
    return null;
  }
  const element = document.createElement("div");
  element.className = "leaf-info-box";

  const title = document.createElement("div");
  title.className = "leaf-info-title";
  title.textContent = name;
  element.appendChild(title);

  const list = document.createElement("ul");
  list.className = "leaf-info-list";
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
  element.appendChild(list);

  return new maplibregl.Marker({ element, anchor: placement.anchor, offset: placement.offset })
    .setLngLat(feature.geometry.coordinates as [number, number])
    .addTo(map);
}

function toRect(
  point: maplibregl.Point,
  width: number,
  height: number,
  placement: MarkerPlacement,
): Rect {
  const [ox, oy] = placement.offset;
  const x = point.x;
  const y = point.y;
  const anchor = placement.anchor;
  if (anchor === "top-left") return { left: x + ox, top: y + oy, right: x + ox + width, bottom: y + oy + height };
  if (anchor === "top") return { left: x - width / 2 + ox, top: y + oy, right: x + width / 2 + ox, bottom: y + oy + height };
  if (anchor === "top-right") return { left: x - width + ox, top: y + oy, right: x + ox, bottom: y + oy + height };
  if (anchor === "right") return { left: x - width + ox, top: y - height / 2 + oy, right: x + ox, bottom: y + height / 2 + oy };
  if (anchor === "bottom-right") return { left: x - width + ox, top: y - height + oy, right: x + ox, bottom: y + oy };
  if (anchor === "bottom") return { left: x - width / 2 + ox, top: y - height + oy, right: x + width / 2 + ox, bottom: y + oy };
  if (anchor === "left") return { left: x + ox, top: y - height / 2 + oy, right: x + ox + width, bottom: y + height / 2 + oy };
  return { left: x + ox, top: y - height + oy, right: x + ox + width, bottom: y + oy }; // bottom-left
}

function intersects(a: Rect, b: Rect, pad = 6): boolean {
  return !(a.right + pad < b.left || a.left - pad > b.right || a.bottom + pad < b.top || a.top - pad > b.bottom);
}

function offscreenPenalty(rect: Rect, width: number, height: number): number {
  let penalty = 0;
  if (rect.left < 0) penalty += -rect.left;
  if (rect.top < 0) penalty += -rect.top;
  if (rect.right > width) penalty += rect.right - width;
  if (rect.bottom > height) penalty += rect.bottom - height;
  return penalty;
}

function measureElement(map: maplibregl.Map, element: HTMLElement): { width: number; height: number } {
  const container = map.getContainer();
  const probe = element.cloneNode(true) as HTMLElement;
  probe.style.position = "absolute";
  probe.style.left = "-10000px";
  probe.style.top = "-10000px";
  probe.style.visibility = "hidden";
  container.appendChild(probe);
  const width = probe.offsetWidth || 220;
  const height = probe.offsetHeight || 120;
  probe.remove();
  return { width, height };
}

function buildLeafInfoElement(feature: GeoJSON.Feature<GeoJSON.Point>): HTMLElement | null {
  const props = (feature.properties ?? {}) as LeafInfoProps;
  const name = typeof props.name === "string" ? props.name : "";
  const lines = Array.isArray(props.grape_lines)
    ? props.grape_lines.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (!name || !lines.length) {
    return null;
  }
  const element = document.createElement("div");
  element.className = "leaf-info-box";

  const title = document.createElement("div");
  title.className = "leaf-info-title";
  title.textContent = name;
  element.appendChild(title);

  const list = document.createElement("ul");
  list.className = "leaf-info-list";
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
  element.appendChild(list);
  return element;
}

export function createLeafInfoMarkers(
  map: maplibregl.Map,
  features: GeoJSON.Feature<GeoJSON.Point>[],
): maplibregl.Marker[] {
  const markers: maplibregl.Marker[] = [];
  const placedRects: Rect[] = [];
  const canvas = map.getCanvas();
  const vw = canvas.clientWidth;
  const vh = canvas.clientHeight;

  const sorted = [...features].sort((a, b) => {
    const pa = map.project(a.geometry.coordinates as [number, number]);
    const pb = map.project(b.geometry.coordinates as [number, number]);
    if (pa.y !== pb.y) return pa.y - pb.y;
    return pa.x - pb.x;
  });

  for (const feature of sorted) {
    const element = buildLeafInfoElement(feature);
    if (!element) {
      continue;
    }
    const { width, height } = measureElement(map, element);
    const point = map.project(feature.geometry.coordinates as [number, number]);

    let chosen = CANDIDATE_PLACEMENTS[0];
    let chosenRect = toRect(point, width, height, chosen);
    let bestScore = Number.POSITIVE_INFINITY;

    for (const placement of CANDIDATE_PLACEMENTS) {
      const rect = toRect(point, width, height, placement);
      let overlapCount = 0;
      for (const placed of placedRects) {
        if (intersects(rect, placed)) {
          overlapCount += 1;
        }
      }
      const score = overlapCount * 1000 + offscreenPenalty(rect, vw, vh);
      if (score < bestScore) {
        bestScore = score;
        chosen = placement;
        chosenRect = rect;
        if (score === 0) {
          break;
        }
      }
    }

    const marker = new maplibregl.Marker({ element, anchor: chosen.anchor, offset: chosen.offset })
      .setLngLat(feature.geometry.coordinates as [number, number])
      .addTo(map);
    markers.push(marker);
    placedRects.push(chosenRect);
  }

  return markers;
}
