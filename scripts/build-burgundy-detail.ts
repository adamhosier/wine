import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import polygonClipping from "polygon-clipping";
import simplify from "@turf/simplify";
import { feature } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type Geometry = Polygon | MultiPolygon;

type DetailDef = {
  slug: string;
  name: string;
  communes: string[];
  simplifyTolerance: number;
  allowedInseeDeptPrefixes: string[];
};

type OverpassElement = {
  type: "relation" | "way" | "node";
  id: number;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type NominatimLookupItem = {
  geojson?: GeoJSON.Geometry;
  osm_id?: number;
  osm_type?: string;
  display_name?: string;
};

const OUT_PATH = path.resolve("src", "data", "burgundy-detail-subregions.geojson");
const FRANCE_SUBREGIONS_PATH = path.resolve("src", "data", "france-wine-subregions.geojson");

const OVERPASS_URLS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup";
const USER_AGENT = "wine-map-dev/0.1 (burgundy-detail-osm)";

const BBOX = {
  south: 46.65,
  west: 4.45,
  north: 47.5,
  east: 5.2,
};

const REQUEST_DELAY_MS = 1100;

const DEFINITIONS: DetailDef[] = [
  {
    slug: "cote-de-nuits",
    name: "Cote de Nuits",
    simplifyTolerance: 0.0012,
    allowedInseeDeptPrefixes: ["21"],
    communes: [
      "Marsannay-la-Côte",
      "Fixin",
      "Gevrey-Chambertin",
      "Morey-Saint-Denis",
      "Chambolle-Musigny",
      "Vougeot",
      "Flagey-Échezeaux",
      "Vosne-Romanée",
      "Nuits-Saint-Georges",
      "Premeaux-Prissey",
      "Comblanchien",
      "Corgoloin",
    ],
  },
  {
    slug: "cote-de-beaune",
    name: "Cote de Beaune",
    simplifyTolerance: 0.00125,
    allowedInseeDeptPrefixes: ["21", "71"],
    communes: [
      "Ladoix-Serrigny",
      "Aloxe-Corton",
      "Pernand-Vergelesses",
      "Savigny-lès-Beaune",
      "Chorey-les-Beaune",
      "Beaune",
      "Pommard",
      "Volnay",
      "Monthelie",
      "Auxey-Duresses",
      "Meursault",
      "Puligny-Montrachet",
      "Chassagne-Montrachet",
      "Saint-Aubin",
      "Santenay",
      "Dezize-lès-Maranges",
      "Cheilly-lès-Maranges",
      "Sampigny-lès-Maranges",
    ],
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string | undefined | null) {
  const raw = String(value ?? "");
  const fixed = raw.includes("Ã") ? Buffer.from(raw, "latin1").toString("utf8") : raw;
  return fixed
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function cleanGeometry(geometry: Geometry, tolerance: number): Geometry {
  const simplified = simplify(feature(geometry), {
    tolerance,
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
    try {
      current = polygonClipping.union(current as any, toMultiPolygonCoords(geometries[i]) as any) as number[][][][];
    } catch {
      // keep best effort
    }
  }
  return current?.length ? fromMultiPolygonCoords(current) : null;
}

function intersectGeometry(geometry: Geometry, clip: Geometry): Geometry | null {
  try {
    const result = polygonClipping.intersection(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(clip) as any,
    ) as number[][][][];
    if (!result?.length) {
      return null;
    }
    return fromMultiPolygonCoords(result);
  } catch {
    return geometry;
  }
}

function subtractGeometry(geometry: Geometry, mask: Geometry): Geometry | null {
  try {
    const result = polygonClipping.difference(
      toMultiPolygonCoords(geometry) as any,
      toMultiPolygonCoords(mask) as any,
    ) as number[][][][];
    if (!result?.length) {
      return null;
    }
    return fromMultiPolygonCoords(result);
  } catch {
    return geometry;
  }
}

function escapeRegexLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchOverpassRelationsByName(names: string[]) {
  const byName = new Map<string, OverpassElement[]>();
  const batchSize = 10;

  async function queryBatch(batch: string[]): Promise<OverpassResponse | null> {
    const regex = batch.map(escapeRegexLiteral).join("|");
    const query = [
      "[out:json][timeout:45];",
      `rel(${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east})[\"boundary\"=\"administrative\"][\"admin_level\"=\"8\"][\"name\"~\"^(${regex})$\",i];`,
      "out ids tags;",
    ].join("\n");

    const body = new URLSearchParams({ data: query }).toString();
    let lastError: string | null = null;

    for (const endpoint of OVERPASS_URLS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": USER_AGENT,
          },
          body,
        });
        if (!response.ok) {
          lastError = `${endpoint} -> HTTP ${response.status}`;
          await sleep(700);
          continue;
        }
        return (await response.json()) as OverpassResponse;
      } catch (error) {
        lastError = `${endpoint} -> ${String(error)}`;
        await sleep(700);
      }
    }

    console.warn(`Overpass batch failed: ${batch.join(", ")} :: ${lastError}`);
    return null;
  }

  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    let json = await queryBatch(batch);
    if (!json) {
      for (const name of batch) {
        const single = await queryBatch([name]);
        if (!single) {
          continue;
        }
        const mergedElements: OverpassElement[] = [
          ...((json?.elements ?? []) as OverpassElement[]),
          ...((single.elements ?? []) as OverpassElement[]),
        ];
        json = { elements: mergedElements };
      }
      if (!json) {
        continue;
      }
    }

    for (const el of json.elements ?? []) {
      if (el.type !== "relation") {
        continue;
      }
      const name = normalizeText(el.tags?.name);
      if (!name) {
        continue;
      }
      const bucket = byName.get(name);
      if (bucket) {
        bucket.push(el);
      } else {
        byName.set(name, [el]);
      }
    }

    await sleep(400);
  }

  return byName;
}

function pickBestRelation(candidates: OverpassElement[], allowedDeptPrefixes: string[]) {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const scored = candidates
    .map((item) => {
      const insee = item.tags?.["ref:INSEE"] ?? "";
      const dept = insee.slice(0, 2);
      let score = 0;
      if (allowedDeptPrefixes.includes(dept)) {
        score += 20;
      }
      if (item.tags?.["wikidata"]) {
        score += 2;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0].item;
}

async function fetchGeometryFromNominatimRelation(relationId: number): Promise<Geometry | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    polygon_geojson: "1",
    osm_ids: `R${relationId}`,
  });
  const response = await fetch(`${NOMINATIM_LOOKUP_URL}?${params.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    return null;
  }

  const items = (await response.json()) as NominatimLookupItem[];
  const match = items.find((item) => isPolygonGeometry(item.geojson));
  if (!match || !match.geojson || !isPolygonGeometry(match.geojson)) {
    return null;
  }
  return match.geojson;
}

function deptPrefixToLabel(prefix: string) {
  if (prefix === "21") {
    return "Cote-d'Or";
  }
  if (prefix === "71") {
    return "Saone-et-Loire";
  }
  return "Bourgogne-Franche-Comte";
}

async function fetchGeometryFromNominatimSearch(
  commune: string,
  allowedDeptPrefixes: string[],
): Promise<{ geometry: Geometry; label: string } | null> {
  const deptHints = [...new Set(allowedDeptPrefixes.map(deptPrefixToLabel))];
  const queries = deptHints.map((hint) => `${commune}, ${hint}, France`);
  queries.push(`${commune}, Bourgogne-Franche-Comte, France`);
  queries.push(`${commune}, France`);

  for (const q of queries) {
    const params = new URLSearchParams({
      format: "jsonv2",
      polygon_geojson: "1",
      limit: "5",
      q,
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      await sleep(400);
      continue;
    }
    const items = (await response.json()) as NominatimLookupItem[];
    const match = items.find((item) => isPolygonGeometry(item.geojson));
    if (match && match.geojson && isPolygonGeometry(match.geojson)) {
      return {
        geometry: match.geojson,
        label: match.display_name ?? q,
      };
    }
    await sleep(400);
  }

  return null;
}

async function loadBurgundyParentGeometry(): Promise<Geometry> {
  const raw = await readFile(FRANCE_SUBREGIONS_PATH, "utf8");
  const fc = JSON.parse(raw) as FeatureCollection<Geometry>;
  const burgundy = fc.features.find((item) => String(item.properties?.slug ?? "") === "burgundy");
  if (!burgundy) {
    throw new Error("Could not find burgundy in france-wine-subregions.geojson");
  }
  return burgundy.geometry;
}

async function main() {
  const burgundyParent = await loadBurgundyParentGeometry();
  const allNames = [...new Set(DEFINITIONS.flatMap((def) => def.communes))];
  const relationsByName = await fetchOverpassRelationsByName(allNames);

  const drafted: Array<Feature<Geometry>> = [];

  for (const def of DEFINITIONS) {
    const geometries: Geometry[] = [];
    const picked: string[] = [];

    for (const commune of def.communes) {
      const key = normalizeText(commune);
      const candidates = relationsByName.get(key) ?? [];
      if (!candidates.length) {
        const fallback = await fetchGeometryFromNominatimSearch(commune, def.allowedInseeDeptPrefixes);
        await sleep(REQUEST_DELAY_MS);
        if (!fallback) {
          console.warn(`[${def.slug}] missing commune relation/search: ${commune}`);
          continue;
        }
        geometries.push(fallback.geometry);
        picked.push(`${commune} (search)`);
        continue;
      }

      const relation = pickBestRelation(candidates, def.allowedInseeDeptPrefixes);
      const geometry = await fetchGeometryFromNominatimRelation(relation.id);
      await sleep(REQUEST_DELAY_MS);
      if (!geometry) {
        const fallback = await fetchGeometryFromNominatimSearch(commune, def.allowedInseeDeptPrefixes);
        await sleep(REQUEST_DELAY_MS);
        if (!fallback) {
          console.warn(`[${def.slug}] missing commune geometry/search: ${commune} (R${relation.id})`);
          continue;
        }
        geometries.push(fallback.geometry);
        picked.push(`${commune} (search after R${relation.id})`);
        continue;
      }

      geometries.push(geometry);
      picked.push(`${commune} (R${relation.id})`);
    }

    const merged = unionGeometries(geometries);
    if (!merged) {
      console.warn(`Skipping ${def.slug}: no commune geometry merged.`);
      continue;
    }

    const clipped = intersectGeometry(merged, burgundyParent);
    if (!clipped) {
      console.warn(`Skipping ${def.slug}: clipped out of burgundy parent.`);
      continue;
    }

    drafted.push({
      type: "Feature",
      id: def.slug,
      properties: {
        slug: def.slug,
        name: def.name,
        parent_slug: "burgundy",
        source_name: "OpenStreetMap via Overpass + Nominatim",
        source_url: "https://overpass-api.de/ ; https://nominatim.openstreetmap.org/",
        source_license: "ODbL 1.0",
        source_communes: picked.join(" | "),
      },
      geometry: cleanGeometry(clipped, def.simplifyTolerance),
    });

    console.log(`Built ${def.slug} with ${picked.length}/${def.communes.length} communes`);
  }

  const bySlug = new Map(drafted.map((item) => [String(item.properties?.slug ?? ""), item]));
  const ordered = DEFINITIONS.map((def) => def.slug);

  const resolved: Array<Feature<Geometry>> = [];
  let occupied: Geometry | null = null;

  for (const slug of ordered) {
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

    const resolvedItem: Feature<Geometry> = {
      ...item,
      geometry,
    };
    resolved.push(resolvedItem);

    occupied = occupied ? unionGeometries([occupied, geometry]) : geometry;
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
