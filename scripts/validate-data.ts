import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type PolygonOrMultiPolygon = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type Point = GeoJSON.Point;

type RegionsCollection = GeoJSON.FeatureCollection<PolygonOrMultiPolygon>;
type SubregionsCollection = GeoJSON.FeatureCollection<PolygonOrMultiPolygon>;
type DetailsCollection = GeoJSON.FeatureCollection<PolygonOrMultiPolygon>;
type WaypointsCollection = GeoJSON.FeatureCollection<Point>;

type ValidationIssue = {
  level: "error" | "warn";
  message: string;
};

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(resolve(process.cwd(), path), "utf8");
  return JSON.parse(text) as T;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function validateFiniteLngLat(
  value: unknown,
  issuePrefix: string,
  issues: ValidationIssue[],
): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    issues.push({ level: "error", message: `${issuePrefix}: invalid coordinates` });
    return null;
  }
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    issues.push({ level: "error", message: `${issuePrefix}: non-finite coordinates` });
    return null;
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    issues.push({ level: "warn", message: `${issuePrefix}: out-of-range coordinates (${lon}, ${lat})` });
  }
  return [lon, lat];
}

async function main() {
  const issues: ValidationIssue[] = [];

  const regions = await readJson<RegionsCollection>("src/data/regions.geojson");
  const subregions = await readJson<SubregionsCollection>("src/data/france-wine-subregions.geojson");
  const details = await readJson<DetailsCollection>("src/data/burgundy-detail-subregions.geojson");
  const waypoints = await readJson<WaypointsCollection>("src/data/burgundy-waypoints.geojson");

  const regionKeys = new Set<string>();
  for (const [index, feature] of regions.features.entries()) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const iso = asString(props.iso_a3);
    if (!iso) {
      issues.push({ level: "error", message: `regions[${index}] missing properties.iso_a3` });
      continue;
    }
    if (regionKeys.has(iso)) {
      issues.push({ level: "error", message: `regions duplicate iso_a3: ${iso}` });
    }
    regionKeys.add(iso);
  }

  const subregionByParentAndSlug = new Set<string>();
  const subregionSlugs = new Set<string>();
  for (const [index, feature] of subregions.features.entries()) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const slug = asString(props.slug);
    const parentIso = asString(props.parent_iso_a3);
    if (!slug) {
      issues.push({ level: "error", message: `subregions[${index}] missing properties.slug` });
      continue;
    }
    if (!parentIso) {
      issues.push({ level: "error", message: `subregions[${index}] missing properties.parent_iso_a3` });
      continue;
    }
    if (!regionKeys.has(parentIso)) {
      issues.push({
        level: "error",
        message: `subregions[${index}] parent_iso_a3=${parentIso} does not match any top-level region`,
      });
    }
    const scopedKey = `${parentIso}:${slug}`;
    if (subregionByParentAndSlug.has(scopedKey)) {
      issues.push({
        level: "error",
        message: `subregions duplicate slug under same parent: ${scopedKey}`,
      });
    }
    subregionByParentAndSlug.add(scopedKey);
    subregionSlugs.add(slug);
  }

  const detailByParentAndSlug = new Set<string>();
  const detailSlugs = new Set<string>();
  for (const [index, feature] of details.features.entries()) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const slug = asString(props.slug);
    const parentSlug = asString(props.parent_slug);
    if (!slug) {
      issues.push({ level: "error", message: `details[${index}] missing properties.slug` });
      continue;
    }
    if (!parentSlug) {
      issues.push({ level: "error", message: `details[${index}] missing properties.parent_slug` });
      continue;
    }
    if (!subregionSlugs.has(parentSlug)) {
      issues.push({
        level: "error",
        message: `details[${index}] parent_slug=${parentSlug} does not match any subregion slug`,
      });
    }
    const scopedKey = `${parentSlug}:${slug}`;
    if (detailByParentAndSlug.has(scopedKey)) {
      issues.push({
        level: "error",
        message: `details duplicate slug under same parent: ${scopedKey}`,
      });
    }
    detailByParentAndSlug.add(scopedKey);
    detailSlugs.add(slug);
  }

  for (const [index, feature] of waypoints.features.entries()) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const point = validateFiniteLngLat(feature.geometry?.coordinates, `waypoints[${index}]`, issues);
    if (!point) {
      continue;
    }
    const parentNodeId = asString(props.parent_node_id);
    const parentSlug = asString(props.parent_slug);
    const name = asString(props.name);

    if (!name) {
      issues.push({ level: "warn", message: `waypoints[${index}] missing properties.name` });
    }
    if (parentNodeId && !/^(region|subregion|detail):/.test(parentNodeId)) {
      issues.push({
        level: "error",
        message: `waypoints[${index}] parent_node_id must be region:/subregion:/detail:, got ${parentNodeId}`,
      });
    }
    if (parentSlug && !subregionSlugs.has(parentSlug) && !detailSlugs.has(parentSlug)) {
      issues.push({
        level: "warn",
        message: `waypoints[${index}] parent_slug=${parentSlug} does not match known subregion/detail slug`,
      });
    }
  }

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warn");

  if (warnings.length > 0) {
    console.warn(`Data validation warnings (${warnings.length}):`);
    for (const warning of warnings) {
      console.warn(`- ${warning.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`Data validation errors (${errors.length}):`);
    for (const error of errors) {
      console.error(`- ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    [
      "Data validation passed.",
      `regions=${regions.features.length}`,
      `subregions=${subregions.features.length}`,
      `details=${details.features.length}`,
      `waypoints=${waypoints.features.length}`,
      warnings.length ? `warnings=${warnings.length}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

main().catch((error) => {
  console.error("Failed to validate data:", error);
  process.exitCode = 1;
});
