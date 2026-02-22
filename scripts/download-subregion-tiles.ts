import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SUBREGION_REMOTE_TILE_TEMPLATE, SUBREGION_TILE_FORMAT, Z_SUBREGION_HI } from "../src/config.js";

type CliOptions = {
  zoom: number;
  overwrite: boolean;
  concurrency: number;
};

type Tile = {
  z: number;
  x: number;
  y: number;
};

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    zoom: Z_SUBREGION_HI,
    overwrite: false,
    concurrency: 8,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--zoom" && args[i + 1]) {
      options.zoom = Number(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--concurrency" && args[i + 1]) {
      options.concurrency = Number(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--overwrite") {
      options.overwrite = true;
    }
  }

  if (!Number.isFinite(options.zoom) || options.zoom < 0 || !Number.isInteger(options.zoom)) {
    throw new Error("Invalid --zoom value. Use a non-negative integer.");
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1 || !Number.isInteger(options.concurrency)) {
    throw new Error("Invalid --concurrency value. Use a positive integer.");
  }
  return options;
}

function lonToTileX(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor((1 - n / Math.PI) * (2 ** zoom) / 2);
}

function tileRangeForBbox(
  [minLon, minLat, maxLon, maxLat]: [number, number, number, number],
  zoom: number,
) {
  const xMin = Math.max(0, lonToTileX(minLon, zoom));
  const xMax = Math.max(0, lonToTileX(maxLon, zoom));
  const yMin = Math.max(0, latToTileY(maxLat, zoom));
  const yMax = Math.max(0, latToTileY(minLat, zoom));

  return {
    xMin: Math.min(xMin, xMax),
    xMax: Math.max(xMin, xMax),
    yMin: Math.min(yMin, yMax),
    yMax: Math.max(yMin, yMax),
  };
}

function geometryBbox(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number, number, number] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const update = (lon: number, lat: number) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  };

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const [lon, lat] of ring) {
        update(lon, lat);
      }
    }
  } else {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          update(lon, lat);
        }
      }
    }
  }

  if (!Number.isFinite(minLon)) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat];
}

function tileUrl(z: number, x: number, y: number) {
  return SUBREGION_REMOTE_TILE_TEMPLATE
    .replace("{z}", String(z))
    .replace("{y}", String(y))
    .replace("{x}", String(x));
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(workers);
}

async function loadSubregionTiles(zoom: number): Promise<Tile[]> {
  const raw = await readFile(path.resolve("src", "data", "france-wine-subregions.geojson"), "utf8");
  const fc = JSON.parse(raw) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

  const unique = new Set<string>();
  for (const feature of fc.features) {
    const bbox = geometryBbox(feature.geometry);
    if (!bbox) {
      continue;
    }
    const { xMin, xMax, yMin, yMax } = tileRangeForBbox(bbox, zoom);
    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        unique.add(`${x}/${y}`);
      }
    }
  }

  const tiles: Tile[] = [];
  for (const key of unique) {
    const [xRaw, yRaw] = key.split("/");
    tiles.push({ z: zoom, x: Number(xRaw), y: Number(yRaw) });
  }
  return tiles;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tasks = await loadSubregionTiles(options.zoom);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let loggedFailures = 0;

  console.log(`Downloading ${tasks.length} tiles for wine subregions at z=${options.zoom}`);

  await runPool(tasks, options.concurrency, async ({ z, x, y }) => {
    const outputDir = path.resolve("public", "tiles", "france-subregions", String(z), String(x));
    const outputFile = path.join(outputDir, `${y}.${SUBREGION_TILE_FORMAT}`);

    if (!options.overwrite && (await fileExists(outputFile))) {
      skipped += 1;
      return;
    }

    const response = await fetch(tileUrl(z, x, y));
    if (!response.ok) {
      failed += 1;
      if (loggedFailures < 20) {
        console.warn(`Failed ${z}/${x}/${y}: ${response.status}`);
        loggedFailures += 1;
      }
      return;
    }

    const content = Buffer.from(await response.arrayBuffer());
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputFile, content);
    downloaded += 1;
  });

  console.log(`Done. Downloaded: ${downloaded}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
