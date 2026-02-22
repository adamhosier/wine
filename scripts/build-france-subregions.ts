import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import shapefile from "shapefile";
import proj4 from "proj4";
import polygonClipping from "polygon-clipping";
import simplify from "@turf/simplify";
import concave from "@turf/concave";
import area from "@turf/area";
import { feature, featureCollection, multiPolygon, point, polygon } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type SubregionDef = {
  slug: string;
  name: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
};

type SourceRowProps = {
  dt?: unknown;
  insee?: unknown;
  app?: unknown;
  denom?: unknown;
};

type MultiPolygonCoords = number[][][][];
type MultiPolygonList = MultiPolygonCoords[];

const SHP_PATH = "data/inao/delim-shp/2026-02-16_delim-parcellaire-aoc-shp.shp";
const DBF_PATH = "data/inao/delim-shp/2026-02-16_delim-parcellaire-aoc-shp.dbf";
const INAO_DATASET_URL =
  "https://www.data.gouv.fr/fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/";
const OSM_CHAMPAGNE_QUERY =
  "https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&q=Champagne-Ardenne%2C%20France";

const MIN_POLYGON_AREA_M2 = 100_000;
const SIMPLIFY_TOLERANCE_DEG = 0.008;
const UNION_BATCH_SIZE = 64;
const CONCAVE_MAX_EDGE_KM_DEFAULT = 35;
const CONCAVE_SOURCE_MIN_AREA_M2 = 100_000;
const CONCAVE_BOUNDARY_SAMPLE_DIVISOR = 16;
const ENVELOPE_SIMPLIFY_TOLERANCE_DEG = 0.0028;
const ENVELOPE_SMOOTHING_PASSES = 1;
const MIN_GENERALIZED_COMPONENT_AREA_M2 = 5_000_000;

const SUBREGIONS: Record<string, SubregionDef> = {
  loire: {
    slug: "loire",
    name: "Loire",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  burgundy: {
    slug: "burgundy",
    name: "Burgundy",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  beaujolais: {
    slug: "beaujolais",
    name: "Beaujolais",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  "north-rhone": {
    slug: "north-rhone",
    name: "North Rhone",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  "south-rhone": {
    slug: "south-rhone",
    name: "South Rhone",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  alsace: {
    slug: "alsace",
    name: "Alsace",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  bordeaux: {
    slug: "bordeaux",
    name: "Bordeaux",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  provence: {
    slug: "provence",
    name: "Provence",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  "languedoc-roussillon": {
    slug: "languedoc-roussillon",
    name: "Languedoc-Roussillon",
    sourceName: "INAO Delimitation Parcellaire AOC Viticoles",
    sourceUrl: INAO_DATASET_URL,
    license: "Licence Ouverte 2.0",
  },
  champagne: {
    slug: "champagne",
    name: "Champagne",
    sourceName: "OpenStreetMap via Nominatim (Champagne-Ardenne historic boundary proxy)",
    sourceUrl: OSM_CHAMPAGNE_QUERY,
    license: "ODbL 1.0",
  },
};

const CONCAVE_ENVELOPE_BY_REGION: Partial<Record<keyof typeof SUBREGIONS, number>> = {
  bordeaux: 32,
  loire: 20,
  beaujolais: 16,
};

function getConcaveMaxEdgeKm(slug: keyof typeof SUBREGIONS): number | null {
  if (slug === "champagne") {
    return null;
  }
  return CONCAVE_ENVELOPE_BY_REGION[slug] ?? CONCAVE_MAX_EDGE_KM_DEFAULT;
}

const DT_TO_SUBREGION = new Map<string, keyof typeof SUBREGIONS>([
  ["angers", "loire"],
  ["tours", "loire"],
  ["dijon", "burgundy"],
  ["macon", "burgundy"],
  ["valence", "north-rhone"],
  ["avignon", "south-rhone"],
  ["colmar", "alsace"],
  ["bordeaux", "bordeaux"],
  ["la valette du var", "provence"],
  ["montpellier", "languedoc-roussillon"],
  ["narbonne", "languedoc-roussillon"],
]);

const LAMBERT93 =
  "+proj=lcc +lat_1=44 +lat_2=49 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs";

function normalizeText(value: string | undefined | null) {
  if (!value) {
    return "";
  }
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/Ã¢/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dtToSubregion(dt: string | undefined | null): keyof typeof SUBREGIONS | null {
  const normalized = normalizeText(dt);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("macon") || normalized.includes("ma con")) {
    return "burgundy";
  }
  return DT_TO_SUBREGION.get(normalized) ?? null;
}

function rowToSubregion(props: SourceRowProps): keyof typeof SUBREGIONS | null {
  const dt = String(props.dt ?? "");
  const dtRegion = dtToSubregion(dt);
  if (!dtRegion) {
    return null;
  }
  if (dtRegion !== "burgundy") {
    return dtRegion;
  }

  const app = normalizeText(String(props.app ?? ""));
  const denom = normalizeText(String(props.denom ?? ""));
  if (app.includes("beaujolais") || denom.includes("beaujolais")) {
    return "beaujolais";
  }
  return "burgundy";
}

function projectPoint([x, y]: number[]) {
  const [lon, lat] = proj4("EPSG:2154", "WGS84", [x, y]);
  return [lon, lat] as [number, number];
}

function projectPolygonCoords(coords: number[][][]) {
  return coords.map((ring) => ring.map(projectPoint));
}

function simplifyOuterRing(polygonCoords: number[][][]) {
  if (!polygonCoords.length || polygonCoords[0].length < 4) {
    return null;
  }
  const ring = polygonCoords[0];
  const step = Math.max(1, Math.floor(ring.length / 120));
  const sampled: number[][] = [];
  for (let i = 0; i < ring.length; i += step) {
    sampled.push(ring[i]);
  }
  if (sampled.length < 3) {
    return null;
  }
  const [sx, sy] = sampled[0];
  const [ex, ey] = sampled[sampled.length - 1];
  if (sx !== ex || sy !== ey) {
    sampled.push([sx, sy]);
  }
  if (sampled.length < 4) {
    return null;
  }
  return sampled;
}

function toProjectedMultiPolygon(geometry: GeoJSON.Geometry | null): MultiPolygonCoords | null {
  if (!geometry) {
    return null;
  }
  if (geometry.type === "Polygon") {
    const projected = projectPolygonCoords(geometry.coordinates as number[][][]);
    const outerRing = simplifyOuterRing(projected);
    if (outerRing) {
      return [[outerRing]];
    }
    return null;
  }
  if (geometry.type === "MultiPolygon") {
    const multi: MultiPolygonCoords = [];
    for (const poly of geometry.coordinates as number[][][][]) {
      const projected = projectPolygonCoords(poly);
      const outerRing = simplifyOuterRing(projected);
      if (outerRing) {
        multi.push([outerRing]);
      }
    }
    return multi.length ? multi : null;
  }
  return null;
}

function unionManyGeometries(geometries: MultiPolygonList): MultiPolygonCoords | null {
  if (!geometries.length) {
    return null;
  }
  let current = geometries.slice();
  while (current.length > 1) {
    const next: MultiPolygonList = [];
    for (let i = 0; i < current.length; i += UNION_BATCH_SIZE) {
      const group = current.slice(i, i + UNION_BATCH_SIZE);
      let merged: MultiPolygonCoords | null = null;
      try {
        merged = (polygonClipping.union as any).apply(null, group as any[]) as MultiPolygonCoords;
      } catch {
        // Fallback to binary union for this batch if one geometry is invalid.
        merged = group[0];
        for (let j = 1; j < group.length; j += 1) {
          try {
            merged = polygonClipping.union(merged as any, group[j] as any) as MultiPolygonCoords;
          } catch {
            // keep partial merge on invalid pieces
          }
        }
      }
      if (merged && merged.length) {
        next.push(merged);
      }
    }
    if (!next.length) {
      return null;
    }
    current = next;
  }
  return current[0];
}

function cleanAndSimplifyGeometry(
  geometry: Polygon | MultiPolygon,
  tolerance = SIMPLIFY_TOLERANCE_DEG,
): Polygon | MultiPolygon {
  const normalized = normalizeGeometryRings(geometry);
  const input =
    normalized.type === "Polygon"
      ? feature<Polygon>(normalized)
      : feature<MultiPolygon>(normalized);
  try {
    const simplified = simplify(input, {
      tolerance,
      highQuality: true,
      mutate: false,
    });
    return simplified.geometry as Polygon | MultiPolygon;
  } catch {
    return normalized;
  }
}

function normalizeRingClosure(ring: number[][]) {
  if (ring.length < 3) {
    return null;
  }
  const closed = ring.slice();
  const [sx, sy] = closed[0];
  const [ex, ey] = closed[closed.length - 1];
  if (sx !== ex || sy !== ey) {
    closed.push([sx, sy]);
  }
  if (closed.length < 4) {
    return null;
  }
  return closed;
}

function normalizeGeometryRings(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates
      .map(normalizeRingClosure)
      .filter((ring): ring is number[][] => Boolean(ring));
    return {
      type: "Polygon",
      coordinates: rings.length ? rings : geometry.coordinates,
    };
  }

  const polys = geometry.coordinates
    .map((poly) =>
      poly
        .map(normalizeRingClosure)
        .filter((ring): ring is number[][] => Boolean(ring)),
    )
    .filter((poly) => poly.length > 0);

  return {
    type: "MultiPolygon",
    coordinates: polys.length ? polys : geometry.coordinates,
  };
}

function smoothRingChaikin(ring: number[][]): number[][] {
  const closed = normalizeRingClosure(ring);
  if (!closed) {
    return ring;
  }

  const base = closed.slice(0, -1);
  if (base.length < 4) {
    return closed;
  }

  const output: number[][] = [];
  for (let i = 0; i < base.length; i += 1) {
    const p0 = base[i];
    const p1 = base[(i + 1) % base.length];
    output.push([
      0.75 * p0[0] + 0.25 * p1[0],
      0.75 * p0[1] + 0.25 * p1[1],
    ]);
    output.push([
      0.25 * p0[0] + 0.75 * p1[0],
      0.25 * p0[1] + 0.75 * p1[1],
    ]);
  }
  output.push([output[0][0], output[0][1]]);
  return output;
}

function smoothGeometry(geometry: Polygon | MultiPolygon, passes = ENVELOPE_SMOOTHING_PASSES) {
  if (passes <= 0) {
    return geometry;
  }

  let current = normalizeGeometryRings(geometry);
  for (let pass = 0; pass < passes; pass += 1) {
    if (current.type === "Polygon") {
      current = {
        type: "Polygon",
        coordinates: current.coordinates.map(smoothRingChaikin),
      };
      continue;
    }
    current = {
      type: "MultiPolygon",
      coordinates: current.coordinates.map((poly) => poly.map(smoothRingChaikin)),
    };
  }
  return normalizeGeometryRings(current);
}

function filterTinyPolygons(coords: MultiPolygonCoords) {
  return coords.filter((poly) => area(polygon(poly)) >= MIN_POLYGON_AREA_M2);
}

function pruneSmallComponents(
  geometry: Polygon | MultiPolygon,
  minAreaM2 = MIN_GENERALIZED_COMPONENT_AREA_M2,
): Polygon | MultiPolygon | null {
  if (geometry.type === "Polygon") {
    const polyArea = area(polygon(geometry.coordinates));
    return polyArea >= minAreaM2 ? geometry : null;
  }

  const kept = geometry.coordinates.filter((poly) => area(polygon(poly)) >= minAreaM2);
  if (!kept.length) {
    return null;
  }
  if (kept.length === 1) {
    return {
      type: "Polygon",
      coordinates: kept[0],
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: kept,
  };
}

function polygonCentroid(ring: number[][]): [number, number] | null {
  if (ring.length < 4) {
    return null;
  }

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    let avgX = 0;
    let avgY = 0;
    const count = ring.length - 1;
    for (let i = 0; i < count; i += 1) {
      avgX += ring[i][0];
      avgY += ring[i][1];
    }
    return count > 0 ? [avgX / count, avgY / count] : null;
  }

  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

function buildConcaveEnvelope(
  geometries: MultiPolygonList,
  maxEdgeKm = CONCAVE_MAX_EDGE_KM_DEFAULT,
): Polygon | MultiPolygon | null {
  const points = [];

  for (const multi of geometries) {
    for (const poly of multi) {
      const polyArea = area(polygon(poly));
      if (polyArea < CONCAVE_SOURCE_MIN_AREA_M2) {
        continue;
      }

      const outer = poly[0];
      if (!outer || outer.length < 4) {
        continue;
      }

      const centroid = polygonCentroid(outer);
      if (centroid) {
        points.push(point(centroid));
      }

      const step = Math.max(1, Math.floor(outer.length / CONCAVE_BOUNDARY_SAMPLE_DIVISOR));
      for (let i = 0; i < outer.length; i += step) {
        points.push(point(outer[i] as [number, number]));
      }
    }
  }

  if (points.length < 4) {
    return null;
  }

  const envelope = concave(featureCollection(points), {
    maxEdge: maxEdgeKm,
    units: "kilometers",
  });

  if (!envelope) {
    return null;
  }

  const geometry = envelope.geometry;
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return null;
  }

  return geometry;
}

function countCoordinates(geometry: Polygon | MultiPolygon) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.reduce((sum, ring) => sum + ring.length, 0);
  }
  let total = 0;
  for (const poly of geometry.coordinates) {
    for (const ring of poly) {
      total += ring.length;
    }
  }
  return total;
}

async function fetchChampagneGeometry(): Promise<Polygon | MultiPolygon | null> {
  const response = await fetch(OSM_CHAMPAGNE_QUERY, {
    headers: {
      "User-Agent": "wine-map-dev/0.1 (subregion-prototype)",
    },
  });
  if (!response.ok) {
    return null;
  }
  const items = (await response.json()) as Array<{ geojson?: GeoJSON.Geometry }>;
  if (!items.length || !items[0].geojson) {
    return null;
  }
  const geometry = items[0].geojson;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return cleanAndSimplifyGeometry(geometry, 0.003);
  }
  return null;
}

async function main() {
  if (!existsSync(SHP_PATH) || !existsSync(DBF_PATH)) {
    throw new Error(
      `Missing INAO shapefile sources. Expected ${SHP_PATH} and ${DBF_PATH}. Download/extract first.`,
    );
  }

  proj4.defs("EPSG:2154", LAMBERT93);
  const geometriesBySlug = new Map<string, MultiPolygonList>();
  const communeBuckets = new Map<string, MultiPolygonList>();
  for (const slug of Object.keys(SUBREGIONS)) {
    geometriesBySlug.set(slug, []);
  }

  const source = await shapefile.open(SHP_PATH, DBF_PATH, { encoding: "latin1" });
  let rowsRead = 0;
  while (true) {
    const next = await source.read();
    if (next.done) {
      break;
    }
    rowsRead += 1;
    const props = (next.value?.properties as SourceRowProps | undefined) ?? {};
    const insee = String(props.insee ?? "");
    const slug = rowToSubregion(props);
    if (!slug) {
      continue;
    }
    const projected = toProjectedMultiPolygon(next.value.geometry as GeoJSON.Geometry | null);
    if (!projected) {
      continue;
    }
    const dedupeKey = `${slug}|${insee || `row-${rowsRead}`}`;
    const bucket = communeBuckets.get(dedupeKey);
    if (bucket) {
      bucket.push(projected);
    } else {
      communeBuckets.set(dedupeKey, [projected]);
    }
  }

  for (const [dedupeKey, pieces] of communeBuckets.entries()) {
    const [slug] = dedupeKey.split("|", 1);
    const target = geometriesBySlug.get(slug);
    if (!target) {
      continue;
    }
    const merged = pieces.length === 1 ? pieces[0] : unionManyGeometries(pieces);
    if (merged && merged.length) {
      target.push(merged);
    }
  }

  const champagneGeometry = await fetchChampagneGeometry();

  const features: Array<Feature<Polygon | MultiPolygon>> = [];
  for (const slug of Object.keys(SUBREGIONS)) {
    const def = SUBREGIONS[slug];
    let geometry: Polygon | MultiPolygon | null = null;

    if (slug === "champagne" && champagneGeometry) {
      geometry = champagneGeometry;
    } else {
      const geometries = geometriesBySlug.get(slug) ?? [];
      if (!geometries.length) {
        continue;
      }

      const concaveMaxEdge = getConcaveMaxEdgeKm(slug as keyof typeof SUBREGIONS);
      if (concaveMaxEdge) {
        console.log(`Generalizing ${def.name} from ${geometries.length} commune geometries...`);
        const envelope = buildConcaveEnvelope(geometries, concaveMaxEdge);
        if (envelope) {
          const smoothed = smoothGeometry(
            cleanAndSimplifyGeometry(envelope, ENVELOPE_SIMPLIFY_TOLERANCE_DEG),
            ENVELOPE_SMOOTHING_PASSES,
          );
          geometry = pruneSmallComponents(smoothed) ?? smoothed;
        }
      }

      if (!geometry) {
        console.log(`Dissolving ${def.name} from ${geometries.length} commune geometries...`);
        const dissolved = unionManyGeometries(geometries);
        if (!dissolved || !dissolved.length) {
          continue;
        }

        const filtered = filterTinyPolygons(dissolved);
        if (!filtered.length) {
          continue;
        }
        geometry = cleanAndSimplifyGeometry(multiPolygon(filtered).geometry);
      }
    }

    features.push({
      type: "Feature",
      id: slug,
      properties: {
        name: def.name,
        slug: def.slug,
        parent_iso_a3: "FRA",
        source_name: def.sourceName,
        source_url: def.sourceUrl,
        source_license: def.license,
      },
      geometry,
    });
  }

  const collection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features,
  };

  const outDir = path.resolve("src", "data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "france-wine-subregions.geojson");
  await writeFile(outPath, `${JSON.stringify(collection)}\n`);

  console.log(`Rows scanned from INAO shapefile: ${rowsRead}`);
  for (const feature of features) {
    const parts =
      feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates.length : 1;
    const points = countCoordinates(feature.geometry);
    console.log(`Built ${feature.properties?.name}: parts=${parts}, points=${points}`);
  }
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
