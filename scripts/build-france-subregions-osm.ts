import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import simplify from "@turf/simplify";
import area from "@turf/area";
import { feature } from "@turf/helpers";
import polygonClipping from "polygon-clipping";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type Geometry = Polygon | MultiPolygon;

type RegionDef = {
  slug: string;
  name: string;
  queries: string[];
  minAreaM2?: number;
  maxAreaM2?: number;
};

type Candidate = {
  geometry: Geometry;
  displayName: string;
  sourceQuery: string;
  className: string;
  typeName: string;
  areaM2: number;
};

type NominatimResult = {
  geojson?: GeoJSON.Geometry;
  display_name?: string;
  class?: string;
  type?: string;
};

const OSM_SOURCE_NAME = "OpenStreetMap via Nominatim";
const OSM_SOURCE_LICENSE = "ODbL 1.0";
const OSM_SOURCE_URL = "https://nominatim.openstreetmap.org/";

const REGIONS_PATH = path.resolve("src", "data", "regions.geojson");
const OUT_PATH = path.resolve("src", "data", "france-wine-subregions.geojson");

const SIMPLIFY_TOLERANCE = 0.003;
const REQUEST_DELAY_MS = 1200;

const SUBREGIONS: RegionDef[] = [
  {
    slug: "champagne",
    name: "Champagne",
    queries: ["Champagne-Ardenne, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "loire",
    name: "Loire",
    queries: ["Val de Loire, France", "Loire Valley, France"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "burgundy",
    name: "Burgundy",
    queries: ["Bourgogne, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "beaujolais",
    name: "Beaujolais",
    queries: ["Beaujolais, France"],
    minAreaM2: 50_000_000,
  },
  {
    slug: "rhone",
    name: "Rhone",
    // OSM has no stable single wine-region polygon; use a deterministic OSM proxy union.
    queries: ["Rhone, France", "Drome, France", "Vaucluse, France", "Ardeche, France"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "alsace",
    name: "Alsace",
    queries: ["Alsace, France"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "bordeaux",
    name: "Bordeaux",
    // OSM query for Bordeaux wine region is unstable; use Gironde administrative polygon.
    queries: ["Gironde, France"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "provence",
    name: "Provence",
    queries: ["Provence-Alpes-Cote d'Azur, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "languedoc-roussillon",
    name: "Languedoc-Roussillon",
    queries: ["Languedoc-Roussillon, France"],
    minAreaM2: 1_000_000_000,
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPolygonGeometry(geometry: GeoJSON.Geometry | undefined): geometry is Geometry {
  return Boolean(geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon"));
}

function toMultiPolygonCoords(geometry: Geometry): number[][][][] {
  return geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
}

function fromMultiPolygonCoords(coords: number[][][][]): Geometry {
  if (coords.length === 1) {
    return {
      type: "Polygon",
      coordinates: coords[0],
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: coords,
  };
}

function cleanGeometry(geometry: Geometry): Geometry {
  const simplified = simplify(feature(geometry), {
    tolerance: SIMPLIFY_TOLERANCE,
    highQuality: true,
    mutate: false,
  });
  return simplified.geometry as Geometry;
}

function scoreCandidate(region: RegionDef, item: Candidate): number {
  let score = 0;
  const className = item.className.toLowerCase();
  const typeName = item.typeName.toLowerCase();
  const label = item.displayName.toLowerCase();

  if (className.includes("boundary") || typeName.includes("administrative") || typeName.includes("historic")) {
    score += 20;
  }
  if (typeName.includes("region") || typeName.includes("natural")) {
    score += 10;
  }
  if (label.includes("france")) {
    score += 5;
  }
  if (label.includes("france metropolitaine") || label.includes("france métropolitaine")) {
    score += 5;
  }

  if (region.minAreaM2 && item.areaM2 < region.minAreaM2) {
    score -= 50;
  }
  if (region.maxAreaM2 && item.areaM2 > region.maxAreaM2) {
    score -= 20;
  }

  score += Math.min(10, Math.log10(Math.max(item.areaM2, 1)));
  return score;
}

async function fetchCandidatesForQuery(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    polygon_geojson: "1",
    limit: "8",
    q: query,
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "wine-map-dev/0.1 (subregion-osm-unified)",
    },
  });
  if (!response.ok) {
    return [];
  }

  const items = (await response.json()) as NominatimResult[];
  const out: Candidate[] = [];

  for (const item of items) {
    if (!isPolygonGeometry(item.geojson)) {
      continue;
    }
    const geometry = cleanGeometry(item.geojson);
    out.push({
      geometry,
      displayName: item.display_name ?? query,
      sourceQuery: query,
      className: item.class ?? "",
      typeName: item.type ?? "",
      areaM2: area(feature(geometry)),
    });
  }

  return out;
}

function unionGeometries(geometries: Geometry[]): Geometry | null {
  if (!geometries.length) {
    return null;
  }

  let current = toMultiPolygonCoords(geometries[0]);
  for (let i = 1; i < geometries.length; i += 1) {
    const next = toMultiPolygonCoords(geometries[i]);
    try {
      current = polygonClipping.union(current as any, next as any) as number[][][][];
    } catch {
      // keep best-effort merge
    }
  }

  if (!current?.length) {
    return null;
  }
  return fromMultiPolygonCoords(current);
}

function intersectWithFrance(geometry: Geometry, franceGeometry: Geometry): Geometry | null {
  try {
    const clipped = polygonClipping.intersection(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(franceGeometry) as any,
    ) as number[][][][];
    if (!clipped?.length) {
      return null;
    }
    return fromMultiPolygonCoords(clipped);
  } catch {
    return geometry;
  }
}

function subtractGeometry(geometry: Geometry, mask: Geometry): Geometry | null {
  try {
    const diff = polygonClipping.difference(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(mask) as any,
    ) as number[][][][];
    if (!diff?.length) {
      return null;
    }
    return fromMultiPolygonCoords(diff);
  } catch {
    return geometry;
  }
}

async function main() {
  const regionsRaw = await readFile(REGIONS_PATH, "utf8");
  const regions = JSON.parse(regionsRaw) as FeatureCollection<Geometry>;
  const franceFeature = regions.features.find((item) => String(item.id ?? "") === "FRA");
  if (!franceFeature) {
    throw new Error("Could not find FRA in src/data/regions.geojson");
  }

  const franceGeometry = franceFeature.geometry;
  const drafted: Array<Feature<Geometry>> = [];

  for (const region of SUBREGIONS) {
    const pickedForRegion: Geometry[] = [];
    const pickedSources: string[] = [];

    for (const query of region.queries) {
      const candidates = await fetchCandidatesForQuery(query);
      await sleep(REQUEST_DELAY_MS);

      if (!candidates.length) {
        continue;
      }

      const ranked = candidates
        .map((candidate) => ({
          candidate,
          score: scoreCandidate(region, candidate),
        }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.candidate;
      if (!best) {
        continue;
      }

      pickedForRegion.push(best.geometry);
      pickedSources.push(`${query} => ${best.displayName}`);
    }

    const merged = unionGeometries(pickedForRegion);
    if (!merged) {
      console.warn(`Skipping ${region.slug}: no OSM polygons selected.`);
      continue;
    }

    const clipped = intersectWithFrance(merged, franceGeometry);
    if (!clipped) {
      console.warn(`Skipping ${region.slug}: geometry clipped away outside France.`);
      continue;
    }

    drafted.push({
      type: "Feature",
      id: region.slug,
      properties: {
        name: region.name,
        slug: region.slug,
        parent_iso_a3: "FRA",
        source_name: OSM_SOURCE_NAME,
        source_url: OSM_SOURCE_URL,
        source_license: OSM_SOURCE_LICENSE,
        source_queries: pickedSources.join(" | "),
      },
      geometry: cleanGeometry(clipped),
    });

    console.log(`Drafted ${region.slug}: ${pickedSources.join(" ; ")}`);
  }

  // Remove overlap deterministically so rendering is cleaner.
  const priority = SUBREGIONS.map((item) => item.slug);
  const bySlug = new Map(drafted.map((item) => [String(item.properties?.slug ?? ""), item]));

  let accumulated: Geometry | null = null;
  const resolved: Array<Feature<Geometry>> = [];

  for (const slug of priority) {
    const current = bySlug.get(slug);
    if (!current) {
      continue;
    }

    let geometry: Geometry | null = current.geometry;
    if (geometry && accumulated) {
      geometry = subtractGeometry(geometry, accumulated);
    }

    if (!geometry) {
      continue;
    }

    const geometryArea = area(feature(geometry));
    if (geometryArea < 10_000_000) {
      continue;
    }

    const resolvedFeature: Feature<Geometry> = {
      ...current,
      geometry,
    };
    resolved.push(resolvedFeature);

    accumulated = accumulated ? unionGeometries([accumulated, geometry]) : geometry;
  }

  const out: FeatureCollection<Geometry> = {
    type: "FeatureCollection",
    features: resolved,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(out)}\n`);

  console.log(`Wrote ${OUT_PATH} (${resolved.length} features)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

