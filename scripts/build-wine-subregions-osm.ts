import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import area from "@turf/area";
import { feature } from "@turf/helpers";
import type { Feature, FeatureCollection } from "geojson";
import { sleep } from "./lib/async.js";
import {
  cleanGeometry,
  intersectGeometry,
  isPolygonGeometry,
  subtractGeometry,
  unionGeometries,
  type Geometry,
} from "./lib/geo-ops.js";

type RegionDef = {
  slug: string;
  name: string;
  parentIsoA3: string;
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
const OUT_PATH = path.resolve("src", "data", "wine-subregions.geojson");

const SIMPLIFY_TOLERANCE = 0.0022;
const REQUEST_DELAY_MS = 1200;

// Flat list; overlap trimming is resolved deterministically per parent country.
const SUBREGIONS: RegionDef[] = [
  {
    slug: "champagne",
    name: "Champagne",
    parentIsoA3: "FRA",
    queries: ["Champagne-Ardenne, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "loire",
    name: "Loire",
    parentIsoA3: "FRA",
    queries: ["Val de Loire, France", "Loire Valley, France", "Centre-Val de Loire, France"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "burgundy",
    name: "Burgundy",
    parentIsoA3: "FRA",
    queries: ["Bourgogne, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "beaujolais",
    name: "Beaujolais",
    parentIsoA3: "FRA",
    queries: ["Beaujolais, France"],
    minAreaM2: 50_000_000,
  },
  {
    slug: "rhone",
    name: "Rhone",
    parentIsoA3: "FRA",
    queries: ["Rhone, France", "Drome, France", "Vaucluse, France", "Ardeche, France"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "alsace",
    name: "Alsace",
    parentIsoA3: "FRA",
    queries: ["Alsace, France"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "bordeaux",
    name: "Bordeaux",
    parentIsoA3: "FRA",
    queries: ["Gironde, France"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "provence",
    name: "Provence",
    parentIsoA3: "FRA",
    queries: ["Provence-Alpes-Cote d'Azur, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "languedoc-roussillon",
    name: "Languedoc-Roussillon",
    parentIsoA3: "FRA",
    queries: ["Languedoc-Roussillon, France"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "los-carneros",
    name: "Los Carneros",
    parentIsoA3: "CAL",
    queries: ["Carneros Resort and Spa, Napa County, California, USA"],
    minAreaM2: 10_000,
    maxAreaM2: 50_000_000,
  },
  {
    slug: "napa",
    name: "Napa",
    parentIsoA3: "CAL",
    queries: ["Napa Valley, California, USA", "Napa County, California, USA"],
    minAreaM2: 20_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "sonoma",
    name: "Sonoma",
    parentIsoA3: "CAL",
    queries: ["Sonoma County, California, USA"],
    minAreaM2: 20_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "santa-barbara-county",
    name: "Santa Barbara County",
    parentIsoA3: "CAL",
    queries: ["Santa Barbara County, California, USA"],
    minAreaM2: 20_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "casablanca-valley",
    name: "Casablanca Valley",
    parentIsoA3: "CHL",
    queries: ["Casablanca Valley, Valparaiso Region, Chile", "Casablanca, Valparaiso Region, Chile"],
    minAreaM2: 20_000_000,
    maxAreaM2: 5_000_000_000,
  },
  {
    slug: "central-valley",
    name: "Central Valley",
    parentIsoA3: "CHL",
    queries: [
      "Libertador General Bernardo O'Higgins Region, Chile",
      "Maule Region, Chile",
      "Santiago Metropolitan Region, Chile",
    ],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "western-cape",
    name: "Western Cape",
    parentIsoA3: "ZAF",
    queries: ["Western Cape, South Africa"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "south-australia",
    name: "South Australia",
    parentIsoA3: "AUS",
    queries: ["South Australia, Australia"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "new-south-wales",
    name: "New South Wales",
    parentIsoA3: "AUS",
    queries: ["New South Wales, Australia"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "victoria",
    name: "Victoria",
    parentIsoA3: "AUS",
    queries: ["Victoria, Australia"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "tasmania",
    name: "Tasmania",
    parentIsoA3: "AUS",
    queries: ["Tasmania, Australia"],
    minAreaM2: 200_000_000,
  },
  {
    slug: "western-australia",
    name: "Western Australia",
    parentIsoA3: "AUS",
    queries: ["Western Australia, Australia"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "martinborough",
    name: "Martinborough",
    parentIsoA3: "NZL",
    queries: [
      "Martinborough Community, South Wairarapa District, Wellington, New Zealand",
      "Martinborough, Wellington Region, New Zealand",
      "Martinborough, New Zealand",
    ],
    minAreaM2: 10_000_000,
    maxAreaM2: 2_000_000_000,
  },
  {
    slug: "marlborough",
    name: "Marlborough",
    parentIsoA3: "NZL",
    queries: ["Marlborough, New Zealand", "Marlborough District, New Zealand"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "central-otago",
    name: "Central Otago",
    parentIsoA3: "NZL",
    queries: ["Central Otago District, New Zealand", "Central Otago, New Zealand"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "hawkes-bay",
    name: "Hawkes Bay",
    parentIsoA3: "NZL",
    queries: ["Hawke's Bay, New Zealand", "Hawkes Bay, New Zealand"],
    minAreaM2: 100_000_000,
  },
  {
    slug: "puglia",
    name: "Puglia",
    parentIsoA3: "ITA",
    queries: ["Puglia, Italy", "Apulia, Italy"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "piemonte",
    name: "Piemonte",
    parentIsoA3: "ITA",
    queries: ["Piemonte, Italy", "Piedmont, Italy"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "veneto",
    name: "Veneto",
    parentIsoA3: "ITA",
    queries: ["Veneto, Italy"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "tuscany",
    name: "Tuscany",
    parentIsoA3: "ITA",
    queries: ["Tuscany, Italy", "Toscana, Italy"],
    minAreaM2: 1_000_000_000,
  },
  {
    slug: "marche",
    name: "Marche",
    parentIsoA3: "ITA",
    queries: ["Marche, Italy"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "abruzzo",
    name: "Abruzzo",
    parentIsoA3: "ITA",
    queries: ["Abruzzo, Italy"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "campania",
    name: "Campania",
    parentIsoA3: "ITA",
    queries: ["Campania, Italy"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "prosecco",
    name: "Prosecco",
    parentIsoA3: "ITA",
    queries: ["Treviso, Veneto, Italy", "Prosecco, Trieste, Italy"],
    minAreaM2: 20_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "rioja",
    name: "Rioja",
    parentIsoA3: "ESP",
    queries: ["La Rioja, Spain", "Rioja, Spain"],
    minAreaM2: 200_000_000,
  },
  {
    slug: "navarra",
    name: "Navarra",
    parentIsoA3: "ESP",
    queries: ["Navarra, Spain", "Navarre, Spain"],
    minAreaM2: 200_000_000,
  },
  {
    slug: "ribera-del-duero",
    name: "Ribera del Duero",
    parentIsoA3: "ESP",
    queries: ["Ribera del Duero, Spain", "Aranda de Duero, Burgos, Spain"],
    minAreaM2: 20_000_000,
    maxAreaM2: 8_000_000_000,
  },
  {
    slug: "catalunya",
    name: "Catalunya",
    parentIsoA3: "ESP",
    queries: ["Catalonia, Spain", "Catalunya, Spain"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "rias-baixas",
    name: "Rias Baixas",
    parentIsoA3: "ESP",
    queries: ["Rias Baixas, Spain", "Pontevedra, Galicia, Spain"],
    minAreaM2: 20_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "jerez",
    name: "Jerez",
    parentIsoA3: "ESP",
    queries: ["Jerez de la Frontera, Cadiz, Spain"],
    minAreaM2: 10_000_000,
    maxAreaM2: 10_000_000_000,
  },
  {
    slug: "port",
    name: "Port",
    parentIsoA3: "PRT",
    queries: ["Douro, Portugal", "Porto, Portugal"],
    minAreaM2: 20_000_000,
    maxAreaM2: 20_000_000_000,
  },
  {
    slug: "mendoza",
    name: "Mendoza",
    parentIsoA3: "ARG",
    queries: ["Provincia de Mendoza, Argentina"],
    minAreaM2: 500_000_000,
  },
  {
    slug: "pfalz",
    name: "Pfalz",
    parentIsoA3: "DEU",
    queries: [
      "Bad Dürkheim, Germany",
      "Südliche Weinstraße, Germany",
      "Neustadt an der Weinstraße, Germany",
      "Landau in der Pfalz, Germany",
    ],
    minAreaM2: 100_000_000,
    maxAreaM2: 9_000_000_000,
  },
  {
    slug: "mosel",
    name: "Mosel",
    parentIsoA3: "DEU",
    queries: [
      "Bernkastel-Wittlich, Germany",
      "Cochem-Zell, Germany",
      "Trier-Saarburg, Germany",
    ],
    minAreaM2: 150_000_000,
  },
  {
    slug: "rheingau",
    name: "Rheingau",
    parentIsoA3: "DEU",
    queries: ["Rheingau, Germany"],
    minAreaM2: 20_000_000,
    maxAreaM2: 2_000_000_000,
  },
];

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
  if (label.includes("wine")) {
    score += 6;
  }
  if (label.includes("valley")) {
    score += 4;
  }

  if (region.minAreaM2 && item.areaM2 < region.minAreaM2) {
    score -= 50;
  }
  if (region.maxAreaM2 && item.areaM2 > region.maxAreaM2) {
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
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "wine-map-dev/0.1 (global-subregion-osm)",
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
    const geometry = cleanGeometry(item.geojson, SIMPLIFY_TOLERANCE);
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
  const regionsRaw = await readFile(REGIONS_PATH, "utf8");
  const regions = JSON.parse(regionsRaw) as FeatureCollection<Geometry>;
  const regionByIso = new Map<string, Geometry>();
  for (const region of regions.features) {
    const iso = String(region.id ?? region.properties?.["iso_a3"] ?? "");
    if (iso) {
      regionByIso.set(iso, region.geometry);
    }
  }

  const drafted: Array<Feature<Geometry>> = [];

  for (const region of SUBREGIONS) {
    const parentGeometry = regionByIso.get(region.parentIsoA3);
    if (!parentGeometry) {
      console.warn(`Skipping ${region.slug}: missing parent ${region.parentIsoA3} in regions.geojson`);
      continue;
    }

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

    const clipped = intersectGeometry(merged, parentGeometry);
    if (!clipped) {
      console.warn(`Skipping ${region.slug}: geometry clipped away outside ${region.parentIsoA3}.`);
      continue;
    }

    drafted.push({
      type: "Feature",
      id: region.slug,
      properties: {
        name: region.name,
        slug: region.slug,
        parent_iso_a3: region.parentIsoA3,
        source_name: OSM_SOURCE_NAME,
        source_url: OSM_SOURCE_URL,
        source_license: OSM_SOURCE_LICENSE,
        source_queries: pickedSources.join(" | "),
      },
      geometry: cleanGeometry(clipped, SIMPLIFY_TOLERANCE),
    });

    console.log(`Drafted ${region.parentIsoA3}/${region.slug}: ${pickedSources.join(" ; ")}`);
  }

  const bySlug = new Map(drafted.map((item) => [String(item.properties?.slug ?? ""), item]));
  const resolved: Array<Feature<Geometry>> = [];

  const defsByParent = new Map<string, RegionDef[]>();
  for (const def of SUBREGIONS) {
    const bucket = defsByParent.get(def.parentIsoA3);
    if (bucket) {
      bucket.push(def);
    } else {
      defsByParent.set(def.parentIsoA3, [def]);
    }
  }

  for (const [parentIso, defs] of defsByParent) {
    let accumulated: Geometry | null = null;

    for (const def of defs) {
      const current = bySlug.get(def.slug);
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
      if (geometryArea < 100) {
        continue;
      }

      const resolvedFeature: Feature<Geometry> = {
        ...current,
        geometry,
        properties: {
          ...current.properties,
          parent_iso_a3: parentIso,
        },
      };
      resolved.push(resolvedFeature);

      accumulated = accumulated ? unionGeometries([accumulated, geometry]) : geometry;
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
