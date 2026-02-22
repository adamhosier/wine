import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type CountryFeature = Feature<Polygon | MultiPolygon>;

const NATURAL_EARTH_10M_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";

const TARGET_REGION_NAMES = new Set([
  "France",
  "Italy",
  "Germany",
  "United States of America",
  "Chile",
  "Portugal",
  "South Africa",
  "Australia",
  "New Zealand",
  "Spain",
  "Argentina",
]);
const METROPOLITAN_FRANCE_BBOX: [number, number, number, number] = [-6.5, 41.0, 10.5, 51.8];
const CONTIGUOUS_US_BBOX: [number, number, number, number] = [-125.0, 24.0, -66.0, 50.0];
const AUSTRALIA_MIN_KEEP_LAT = -50.0;
const MAINLAND_ESP_BBOX: [number, number, number, number] = [-10.5, 35.0, 4.5, 44.5];
const MAINLAND_PRT_BBOX: [number, number, number, number] = [-10.0, 36.5, -6.0, 42.5];

function toCountryFeature(rawFeature: Feature): CountryFeature | null {
  const geometry = rawFeature.geometry;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    return null;
  }

  const rawProps = (rawFeature.properties ?? {}) as Record<string, unknown>;
  const isoA3 =
    typeof rawProps.ISO_A3_EH === "string"
      ? rawProps.ISO_A3_EH
      : typeof rawProps.ISO_A3 === "string"
        ? rawProps.ISO_A3
        : null;
  const isoA2 =
    typeof rawProps.ISO_A2_EH === "string"
      ? rawProps.ISO_A2_EH
      : typeof rawProps.ISO_A2 === "string"
        ? rawProps.ISO_A2
        : null;
  const name =
    typeof rawProps.NAME_EN === "string"
      ? rawProps.NAME_EN
      : typeof rawProps.NAME === "string"
        ? rawProps.NAME
        : isoA3 ?? "Unknown";

  if (!isoA3 || isoA3 === "-99") {
    return null;
  }

  return {
    type: "Feature",
    id: isoA3,
    properties: {
      name,
      iso_a2: isoA2,
      iso_a3: isoA3,
      source: "Natural Earth 10m Admin 0 Countries",
    },
    geometry,
  };
}

function ringIntersectsBbox(
  ring: number[][],
  [minLon, minLat, maxLon, maxLat]: [number, number, number, number],
) {
  for (const [lon, lat] of ring) {
    if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
      return true;
    }
  }
  return false;
}

function isMetropolitanFrancePolygon(polygon: number[][][]) {
  return polygon.some((ring) => ringIntersectsBbox(ring, METROPOLITAN_FRANCE_BBOX));
}

function polygonIntersectsBbox(polygon: number[][][], bbox: [number, number, number, number]) {
  return polygon.some((ring) => ringIntersectsBbox(ring, bbox));
}

function polygonBbox(polygon: number[][][]): [number, number, number, number] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const ring of polygon) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!Number.isFinite(minLon)) {
    return null;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function ringSignedArea(ring: number[][]) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function polygonOuterAreaAbs(polygon: number[][][]) {
  if (polygon.length === 0) {
    return 0;
  }
  return Math.abs(ringSignedArea(polygon[0]));
}

function largestPolygons(polygons: number[][][][], count: number) {
  return [...polygons]
    .sort((a, b) => polygonOuterAreaAbs(b) - polygonOuterAreaAbs(a))
    .slice(0, count);
}

function toSinglePolygonMultiGeometry(feature: CountryFeature, scope: string): CountryFeature {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope,
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [geometry.coordinates],
      },
    };
  }
  const largest = largestPolygons(geometry.coordinates, 1)[0] ?? null;
  return {
    ...feature,
    properties: {
      ...feature.properties,
      scope,
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: largest ? [largest] : [],
    },
  };
}

function toToolRegionFeature(feature: CountryFeature): CountryFeature {
  const iso = String(feature.properties?.iso_a3 ?? "");
  const geometry = feature.geometry;

  if (iso === "FRA") {
    if (geometry.type === "Polygon") {
      return isMetropolitanFrancePolygon(geometry.coordinates)
        ? {
            ...feature,
            properties: {
              ...feature.properties,
              scope: "Metropolitan mainland France only (Corsica excluded)",
            },
          }
        : {
            ...feature,
            geometry: {
              type: "MultiPolygon",
              coordinates: [],
            },
          };
    }

    const metroPolygons = geometry.coordinates.filter(isMetropolitanFrancePolygon);
    const largestMainland =
      metroPolygons.length > 0
        ? metroPolygons.reduce((best, polygon) =>
            polygonOuterAreaAbs(polygon) > polygonOuterAreaAbs(best) ? polygon : best,
          )
        : null;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope: "Metropolitan mainland France only (Corsica excluded)",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: largestMainland ? [largestMainland] : [],
      },
    };
  }

  if (iso === "USA") {
    if (geometry.type === "Polygon") {
      const keep = polygonIntersectsBbox(geometry.coordinates, CONTIGUOUS_US_BBOX);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          scope: "Contiguous US mainland only (Alaska, Hawaii, territories excluded)",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: keep ? [geometry.coordinates] : [],
        },
      };
    }

    const contiguousPolygons = geometry.coordinates.filter((polygon) =>
      polygonIntersectsBbox(polygon, CONTIGUOUS_US_BBOX),
    );
    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope: "Contiguous US mainland only (Alaska, Hawaii, territories excluded)",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: contiguousPolygons,
      },
    };
  }

  if (iso === "NZL") {
    if (geometry.type === "Polygon") {
      return {
        ...feature,
        properties: {
          ...feature.properties,
          scope: "New Zealand main islands only (offshore islands excluded)",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: [geometry.coordinates],
        },
      };
    }
    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope: "New Zealand main islands only (offshore islands excluded)",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: largestPolygons(geometry.coordinates, 2),
      },
    };
  }

  if (iso === "ESP") {
    if (geometry.type === "Polygon") {
      const keep = polygonIntersectsBbox(geometry.coordinates, MAINLAND_ESP_BBOX);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          scope: "Mainland Spain only (offshore islands excluded)",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: keep ? [geometry.coordinates] : [],
        },
      };
    }

    const mainlandPolygons = geometry.coordinates.filter((polygon) =>
      polygonIntersectsBbox(polygon, MAINLAND_ESP_BBOX),
    );
    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope: "Mainland Spain only (offshore islands excluded)",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: largestPolygons(mainlandPolygons, 1),
      },
    };
  }

  if (iso === "PRT") {
    if (geometry.type === "Polygon") {
      const keep = polygonIntersectsBbox(geometry.coordinates, MAINLAND_PRT_BBOX);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          scope: "Mainland Portugal only (offshore islands excluded)",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: keep ? [geometry.coordinates] : [],
        },
      };
    }

    const mainlandPolygons = geometry.coordinates.filter((polygon) =>
      polygonIntersectsBbox(polygon, MAINLAND_PRT_BBOX),
    );
    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope: "Mainland Portugal only (offshore islands excluded)",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: largestPolygons(mainlandPolygons, 1),
      },
    };
  }

  if (iso === "CHL") {
    return toSinglePolygonMultiGeometry(feature, "Chile mainland only (offshore islands excluded)");
  }

  if (iso === "ZAF") {
    return toSinglePolygonMultiGeometry(feature, "South Africa mainland only (offshore islands excluded)");
  }

  if (iso === "AUS") {
    const keepPolygon = (polygon: number[][][]) => {
      const bbox = polygonBbox(polygon);
      if (!bbox) {
        return false;
      }
      const [, minLat, , maxLat] = bbox;
      return maxLat >= AUSTRALIA_MIN_KEEP_LAT || minLat >= AUSTRALIA_MIN_KEEP_LAT;
    };

    if (geometry.type === "Polygon") {
      const keep = keepPolygon(geometry.coordinates);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          scope: "Australia mainland + Tasmania (far-south outlying islands excluded)",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: keep ? [geometry.coordinates] : [],
        },
      };
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        scope: "Australia mainland + Tasmania (far-south outlying islands excluded)",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: largestPolygons(geometry.coordinates.filter(keepPolygon), 2),
      },
    };
  }

  return feature;
}

async function main() {
  console.log(`Downloading borders from ${NATURAL_EARTH_10M_COUNTRIES_URL}`);
  const response = await fetch(NATURAL_EARTH_10M_COUNTRIES_URL);
  if (!response.ok) {
    throw new Error(`Failed to download borders: HTTP ${response.status}`);
  }

  const raw = (await response.json()) as FeatureCollection;
  const countries: CountryFeature[] = [];
  for (const feature of raw.features) {
    const country = toCountryFeature(feature);
    if (country) {
      countries.push(country);
    }
  }

  const allCountriesCollection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: countries,
  };

  const regionCollection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: countries
      .filter((feature) => TARGET_REGION_NAMES.has(String(feature.properties?.name ?? "")))
      .map(toToolRegionFeature)
      .filter((feature) => {
        if (feature.geometry.type === "Polygon") {
          return feature.geometry.coordinates.length > 0;
        }
        return feature.geometry.coordinates.length > 0;
      }),
  };

  const srcDataDir = path.resolve("src", "data");
  await mkdir(srcDataDir, { recursive: true });
  const countriesOutPath = path.join(srcDataDir, "countries.geojson");
  const regionsOutPath = path.join(srcDataDir, "regions.geojson");

  // Preserve custom promoted US top-level regions (CAL/ORE) if they already exist,
  // and replace USA with these features to keep hierarchy stable.
  let existingPromotedUsRegions = new Map<string, CountryFeature>();
  try {
    const existingRegionsRaw = await readFile(regionsOutPath, "utf8");
    const existingRegions = JSON.parse(existingRegionsRaw) as FeatureCollection<Polygon | MultiPolygon>;
    for (const feature of existingRegions.features) {
      const id = String(feature.id ?? "");
      if (id === "CAL" || id === "ORE") {
        existingPromotedUsRegions.set(id, feature);
      }
    }
  } catch {
    existingPromotedUsRegions = new Map<string, CountryFeature>();
  }

  if (existingPromotedUsRegions.size > 0) {
    const replaced: CountryFeature[] = [];
    for (const feature of regionCollection.features) {
      if (String(feature.id ?? "") === "USA") {
        const cal = existingPromotedUsRegions.get("CAL");
        const ore = existingPromotedUsRegions.get("ORE");
        if (cal) replaced.push(cal);
        if (ore) replaced.push(ore);
      } else {
        replaced.push(feature);
      }
    }
    regionCollection.features = replaced;
  }

  await writeFile(countriesOutPath, JSON.stringify(allCountriesCollection));
  await writeFile(regionsOutPath, `${JSON.stringify(regionCollection, null, 2)}\n`);

  console.log(`Saved all countries: ${countriesOutPath} (${allCountriesCollection.features.length} features)`);
  console.log(`Saved current regions (active set): ${regionsOutPath} (${regionCollection.features.length} features)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
