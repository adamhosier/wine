import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import simplify from "@turf/simplify";
import area from "@turf/area";
import { feature } from "@turf/helpers";
import polygonClipping from "polygon-clipping";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type Geometry = Polygon | MultiPolygon;

type DetailDef = {
  slug: string;
  name: string;
  parentSlug: string;
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

const OUT_PATH = path.resolve("src", "data", "burgundy-detail-subregions.geojson");
const SUBREGIONS_PATH = path.resolve("src", "data", "france-wine-subregions.geojson");

const OSM_SOURCE_NAME = "OpenStreetMap via Nominatim";
const OSM_SOURCE_LICENSE = "ODbL 1.0";
const OSM_SOURCE_URL = "https://nominatim.openstreetmap.org/";
const SIMPLIFY_TOLERANCE = 0.0015;
const REQUEST_DELAY_MS = 1200;

// Keep hand-curated Burgundy detail from prior script; add new detail sets with the same geometry pipeline.
const PRESERVE_EXISTING_SLUGS = new Set(["cote-de-nuits", "cote-de-beaune"]);

const DETAIL_DEFS: DetailDef[] = [
  {
    slug: "chablis",
    name: "Chablis",
    parentSlug: "burgundy",
    queries: ["Chablis, Yonne, France"],
    minAreaM2: 2_000_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "maconnais",
    name: "Maconnais",
    parentSlug: "burgundy",
    queries: ["Macon, Saone-et-Loire, France", "Maconnais, France"],
    minAreaM2: 5_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "vouvray",
    name: "Vouvray",
    parentSlug: "loire",
    queries: ["Vouvray, France"],
    minAreaM2: 5_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "touraine",
    name: "Touraine",
    parentSlug: "loire",
    queries: ["Touraine, France"],
    minAreaM2: 20_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "sancerre",
    name: "Sancerre",
    parentSlug: "loire",
    queries: ["Sancerre, Cher, France"],
    minAreaM2: 2_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "pouilly-fume",
    name: "Pouilly-Fume",
    parentSlug: "loire",
    queries: ["Pouilly-sur-Loire, Nievre, France"],
    minAreaM2: 2_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "sauternes",
    name: "Sauternes",
    parentSlug: "bordeaux",
    queries: ["Sauternes, Gironde, France"],
    minAreaM2: 2_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "pessac-leognan",
    name: "Pessac-Leognan",
    parentSlug: "bordeaux",
    queries: ["Pessac, Gironde, France", "Leognan, Gironde, France"],
    minAreaM2: 2_000_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "graves",
    name: "Graves",
    parentSlug: "bordeaux",
    queries: ["Graves, Gironde, France"],
    minAreaM2: 2_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "pauillac",
    name: "Pauillac",
    parentSlug: "bordeaux",
    queries: ["Pauillac, Gironde, France"],
    minAreaM2: 1_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "haut-medoc",
    name: "Haut-Medoc",
    parentSlug: "bordeaux",
    queries: ["Haut-Medoc, Gironde, France", "Pauillac, Gironde, France"],
    minAreaM2: 1_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "margaux",
    name: "Margaux",
    parentSlug: "bordeaux",
    queries: ["Margaux, Gironde, France", "Margaux-Cantenac, Gironde, France"],
    minAreaM2: 1_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "pomerol",
    name: "Pomerol",
    parentSlug: "bordeaux",
    queries: ["Pomerol, Gironde, France"],
    minAreaM2: 500_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "saint-emilion",
    name: "Saint-Emilion",
    parentSlug: "bordeaux",
    queries: ["Saint-Emilion, Gironde, France", "Saint-Émilion, Gironde, France"],
    minAreaM2: 1_000_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "condrieu",
    name: "Condrieu",
    parentSlug: "rhone",
    queries: ["Condrieu, Rhone, France"],
    minAreaM2: 1_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "cote-rotie",
    name: "Cote Rotie",
    parentSlug: "rhone",
    queries: ["Ampuis, Rhone, France", "Cote Rotie, France"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "hermitage",
    name: "Hermitage",
    parentSlug: "rhone",
    queries: ["Tain-l'Hermitage, Drome, France"],
    minAreaM2: 500_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "crozes-hermitage",
    name: "Crozes-Hermitage",
    parentSlug: "rhone",
    queries: ["Crozes-Hermitage, Drome, France"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "chateauneuf-du-pape",
    name: "Chateauneuf-du-Pape",
    parentSlug: "rhone",
    queries: ["Chateauneuf-du-Pape, Vaucluse, France"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "fleurie",
    name: "Fleurie",
    parentSlug: "beaujolais",
    queries: ["Fleurie, Rhone, France"],
    minAreaM2: 500_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "gavi",
    name: "Gavi",
    parentSlug: "piemonte",
    queries: ["Gavi, Alessandria, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "barolo",
    name: "Barolo",
    parentSlug: "piemonte",
    queries: ["Barolo, Cuneo, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "barbaresco",
    name: "Barbaresco",
    parentSlug: "piemonte",
    queries: ["Barbaresco, Cuneo, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "barbera-dasti",
    name: "Barbera d'Asti",
    parentSlug: "piemonte",
    queries: ["Nizza Monferrato, Asti, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 3_000_000_000,
  },
  {
    slug: "asti",
    name: "Asti",
    parentSlug: "piemonte",
    queries: ["Asti Province, Piedmont, Italy", "Asti, Piedmont, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 3_000_000_000,
  },
  {
    slug: "soave",
    name: "Soave",
    parentSlug: "veneto",
    queries: ["Soave, Verona, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "valpolicella",
    name: "Valpolicella",
    parentSlug: "veneto",
    queries: ["Valpolicella, Verona, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 4_000_000_000,
  },
  {
    slug: "verdicchio-dei-castelli-di-jesi",
    name: "Verdicchio dei Castelli di Jesi",
    parentSlug: "marche",
    queries: ["Jesi, Ancona, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 6_000_000_000,
  },
  {
    slug: "fiano-di-avellino",
    name: "Fiano di Avellino",
    parentSlug: "campania",
    queries: ["Avellino, Campania, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 4_000_000_000,
  },
  {
    slug: "chianti",
    name: "Chianti",
    parentSlug: "tuscany",
    queries: ["Chianti, Siena, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 6_000_000_000,
  },
  {
    slug: "brunello-di-montalcino",
    name: "Brunello di Montalcino",
    parentSlug: "tuscany",
    queries: ["Montalcino, Siena, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 3_000_000_000,
  },
  {
    slug: "montepulciano-dabruzzo",
    name: "Montepulciano d'Abruzzo",
    parentSlug: "abruzzo",
    queries: ["Montepulciano, Abruzzo, Italy", "Chieti, Abruzzo, Italy"],
    minAreaM2: 500_000,
    maxAreaM2: 8_000_000_000,
  },
  {
    slug: "walker-bay",
    name: "Walker Bay",
    parentSlug: "western-cape",
    queries: ["Walker Bay, Western Cape, South Africa", "Walker Bay, South Africa"],
    minAreaM2: 20_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "constantia",
    name: "Constantia",
    parentSlug: "western-cape",
    queries: ["Constantia, Cape Town, South Africa"],
    minAreaM2: 1_000_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "elgin",
    name: "Elgin",
    parentSlug: "western-cape",
    queries: ["Theewaterskloof Local Municipality, Western Cape, South Africa"],
    minAreaM2: 50_000_000,
    maxAreaM2: 6_000_000_000,
  },
  {
    slug: "rutherford",
    name: "Rutherford",
    parentSlug: "napa",
    queries: ["Rutherford, Napa County, California, USA"],
    minAreaM2: 100_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "oakville",
    name: "Oakville",
    parentSlug: "napa",
    queries: ["Oakville, Napa County, California, USA"],
    minAreaM2: 100_000,
    maxAreaM2: 1_000_000_000,
  },
  {
    slug: "yarra-valley",
    name: "Yarra Valley",
    parentSlug: "victoria",
    queries: ["Shire of Yarra Ranges, Victoria, Australia"],
    minAreaM2: 50_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "mornington-peninsula",
    name: "Mornington Peninsula",
    parentSlug: "victoria",
    queries: ["Shire of Mornington Peninsula, Victoria, Australia"],
    minAreaM2: 50_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "clare-valley",
    name: "Clare Valley",
    parentSlug: "south-australia",
    queries: ["Clare, South Australia, Australia"],
    minAreaM2: 5_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "eden-valley",
    name: "Eden Valley",
    parentSlug: "south-australia",
    queries: ["Eden Valley, South Australia, Australia"],
    minAreaM2: 5_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "barossa-valley",
    name: "Barossa Valley",
    parentSlug: "south-australia",
    queries: ["Barossa, South Australia, Australia", "The Barossa Council, South Australia, Australia"],
    minAreaM2: 50_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "adelaide-hills",
    name: "Adelaide Hills",
    parentSlug: "south-australia",
    queries: ["Adelaide Hills Council, South Australia, Australia"],
    minAreaM2: 20_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "coonawarra",
    name: "Coonawarra",
    parentSlug: "south-australia",
    queries: ["Coonawarra, South Australia, Australia"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "mclaren-vale",
    name: "McLaren Vale",
    parentSlug: "south-australia",
    queries: ["McLaren Vale, South Australia, Australia"],
    minAreaM2: 500_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "hunter-valley",
    name: "Hunter Valley",
    parentSlug: "new-south-wales",
    queries: ["Hunter Valley, New South Wales, Australia"],
    minAreaM2: 10_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "margaret-river",
    name: "Margaret River",
    parentSlug: "western-australia",
    queries: ["Margaret River, Western Australia, Australia"],
    minAreaM2: 2_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "colchagua-valley",
    name: "Colchagua Valley",
    parentSlug: "central-valley",
    queries: ["Provincia de Colchagua, Chile"],
    minAreaM2: 10_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "maipo-valley",
    name: "Maipo Valley",
    parentSlug: "central-valley",
    queries: ["Provincia de Maipo, Chile"],
    minAreaM2: 10_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "stellenbosch",
    name: "Stellenbosch",
    parentSlug: "western-cape",
    queries: ["Stellenbosch Local Municipality, Western Cape, South Africa", "Stellenbosch, South Africa"],
    minAreaM2: 2_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "priorat",
    name: "Priorat",
    parentSlug: "catalunya",
    queries: ["Priorat, Tarragona, Spain"],
    minAreaM2: 2_000_000,
    maxAreaM2: 5_000_000_000,
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
      // keep best effort
    }
  }
  return current?.length ? fromMultiPolygonCoords(current) : null;
}

function intersectGeometry(geometry: Geometry, clip: Geometry): Geometry | null {
  try {
    const clipped = polygonClipping.intersection(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(clip) as any,
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

function scoreCandidate(def: DetailDef, item: Candidate): number {
  let score = 0;
  const className = item.className.toLowerCase();
  const typeName = item.typeName.toLowerCase();
  const label = item.displayName.toLowerCase();

  if (className.includes("boundary") || typeName.includes("administrative")) {
    score += 20;
  }
  if (typeName.includes("valley") || typeName.includes("peninsula") || typeName.includes("region")) {
    score += 10;
  }
  if (label.includes("wine")) {
    score += 6;
  }

  if (def.minAreaM2 && item.areaM2 < def.minAreaM2) {
    score -= 50;
  }
  if (def.maxAreaM2 && item.areaM2 > def.maxAreaM2) {
    score -= 30;
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
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "User-Agent": "wine-map-dev/0.1 (global-detail-osm)",
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

async function main() {
  const subregionsRaw = await readFile(SUBREGIONS_PATH, "utf8");
  const subregions = JSON.parse(subregionsRaw) as FeatureCollection<Geometry>;
  const parentBySlug = new Map<string, Geometry>();
  for (const sub of subregions.features) {
    const slug = String(sub.properties?.["slug"] ?? "");
    if (slug) {
      parentBySlug.set(slug, sub.geometry);
    }
  }

  let preserved: Array<Feature<Geometry>> = [];
  try {
    const existingRaw = await readFile(OUT_PATH, "utf8");
    const existing = JSON.parse(existingRaw) as FeatureCollection<Geometry>;
    preserved = existing.features.filter((item) => {
      const slug = String(item.properties?.["slug"] ?? "");
      return PRESERVE_EXISTING_SLUGS.has(slug);
    });
  } catch {
    preserved = [];
  }

  const drafted: Array<Feature<Geometry>> = [];

  for (const def of DETAIL_DEFS) {
    const parentGeometry = parentBySlug.get(def.parentSlug);
    if (!parentGeometry) {
      console.warn(`Skipping ${def.slug}: missing parent subregion ${def.parentSlug}`);
      continue;
    }

    const candidatesByQuery: Geometry[] = [];
    const pickedSources: string[] = [];

    for (const query of def.queries) {
      const candidates = await fetchCandidatesForQuery(query);
      await sleep(REQUEST_DELAY_MS);
      if (!candidates.length) {
        continue;
      }

      const ranked = candidates
        .map((candidate) => ({
          candidate,
          score: scoreCandidate(def, candidate),
        }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0]?.candidate;
      if (!best) {
        continue;
      }

      candidatesByQuery.push(best.geometry);
      pickedSources.push(`${query} => ${best.displayName}`);
    }

    const merged = unionGeometries(candidatesByQuery);
    if (!merged) {
      console.warn(`Skipping ${def.slug}: no geometry selected.`);
      continue;
    }

    const clipped = intersectGeometry(merged, parentGeometry);
    if (!clipped) {
      console.warn(`Skipping ${def.slug}: clipped outside parent ${def.parentSlug}`);
      continue;
    }

    drafted.push({
      type: "Feature",
      id: def.slug,
      properties: {
        slug: def.slug,
        name: def.name,
        parent_slug: def.parentSlug,
        source_name: OSM_SOURCE_NAME,
        source_url: OSM_SOURCE_URL,
        source_license: OSM_SOURCE_LICENSE,
        source_queries: pickedSources.join(" | "),
      },
      geometry: cleanGeometry(clipped),
    });

    console.log(`Drafted detail ${def.parentSlug}/${def.slug}: ${pickedSources.join(" ; ")}`);
  }

  const byParent = new Map<string, Feature<Geometry>[]>();
  for (const item of [...preserved, ...drafted]) {
    const parentSlug = String(item.properties?.["parent_slug"] ?? "");
    if (!parentSlug) {
      continue;
    }
    const bucket = byParent.get(parentSlug);
    if (bucket) {
      bucket.push(item);
    } else {
      byParent.set(parentSlug, [item]);
    }
  }

  const desiredOrderByParent = new Map<string, string[]>();
  desiredOrderByParent.set("burgundy", ["cote-de-nuits", "cote-de-beaune", "chablis", "maconnais"]);
  desiredOrderByParent.set("napa", ["rutherford", "oakville"]);
  desiredOrderByParent.set("victoria", ["yarra-valley", "mornington-peninsula"]);
  desiredOrderByParent.set("south-australia", [
    "clare-valley",
    "eden-valley",
    "barossa-valley",
    "adelaide-hills",
    "coonawarra",
    "mclaren-vale",
  ]);
  desiredOrderByParent.set("new-south-wales", ["hunter-valley"]);
  desiredOrderByParent.set("western-australia", ["margaret-river"]);
  desiredOrderByParent.set("loire", ["vouvray", "touraine", "sancerre", "pouilly-fume"]);
  desiredOrderByParent.set("bordeaux", [
    "sauternes",
    "pessac-leognan",
    "graves",
    "pauillac",
    "haut-medoc",
    "margaux",
    "pomerol",
    "saint-emilion",
  ]);
  desiredOrderByParent.set("rhone", [
    "condrieu",
    "cote-rotie",
    "hermitage",
    "crozes-hermitage",
    "chateauneuf-du-pape",
  ]);
  desiredOrderByParent.set("western-cape", ["walker-bay", "constantia", "elgin", "stellenbosch"]);
  desiredOrderByParent.set("beaujolais", ["fleurie"]);
  desiredOrderByParent.set("central-valley", ["colchagua-valley", "maipo-valley"]);
  desiredOrderByParent.set("catalunya", ["priorat"]);
  desiredOrderByParent.set("piemonte", ["gavi", "barolo", "barbaresco", "barbera-dasti", "asti"]);
  desiredOrderByParent.set("veneto", ["soave", "valpolicella"]);
  desiredOrderByParent.set("marche", ["verdicchio-dei-castelli-di-jesi"]);
  desiredOrderByParent.set("campania", ["fiano-di-avellino"]);
  desiredOrderByParent.set("tuscany", ["chianti", "brunello-di-montalcino"]);
  desiredOrderByParent.set("abruzzo", ["montepulciano-dabruzzo"]);

  const resolved: Array<Feature<Geometry>> = [];
  for (const [parentSlug, items] of byParent) {
    const bySlug = new Map(items.map((item) => [String(item.properties?.["slug"] ?? ""), item]));
    const preferred = desiredOrderByParent.get(parentSlug) ?? [...bySlug.keys()];

    let occupied: Geometry | null = null;
    for (const slug of preferred) {
      const item = bySlug.get(slug);
      if (!item) {
        continue;
      }
      let geometry: Geometry | null = item.geometry;
      if (geometry && occupied) {
        geometry = subtractGeometry(geometry, occupied);
      }
      if (!geometry) {
        continue;
      }
      const geometryArea = area(feature(geometry));
      if (geometryArea < 100) {
        continue;
      }

      resolved.push({
        ...item,
        geometry: cleanGeometry(geometry),
      });
      occupied = occupied ? unionGeometries([occupied, geometry]) : geometry;
    }
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
