import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type CountryFeature = Feature<Polygon | MultiPolygon>;

const NATURAL_EARTH_10M_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";

const TARGET_REGION_NAMES = new Set(["France", "Italy"]);
const METROPOLITAN_FRANCE_BBOX: [number, number, number, number] = [-6.5, 41.0, 10.5, 51.8];

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

function toToolRegionFeature(feature: CountryFeature): CountryFeature {
  const iso = String(feature.properties?.iso_a3 ?? "");
  if (iso !== "FRA") {
    return feature;
  }

  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    return isMetropolitanFrancePolygon(geometry.coordinates)
      ? feature
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

  await writeFile(countriesOutPath, JSON.stringify(allCountriesCollection));
  await writeFile(regionsOutPath, `${JSON.stringify(regionCollection, null, 2)}\n`);

  console.log(`Saved all countries: ${countriesOutPath} (${allCountriesCollection.features.length} features)`);
  console.log(`Saved current regions (FRA/ITA): ${regionsOutPath} (${regionCollection.features.length} features)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
