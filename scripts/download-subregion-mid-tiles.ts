import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { WINE_REGION_REMOTE_TILE_TEMPLATE, WINE_REGION_TILE_FORMAT, Z_SUBREGION_MID } from "../src/config.js";
import { fileExists, geometryBbox, runPool, tileRangeForBbox } from "./lib/tiles.js";

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
    zoom: Z_SUBREGION_MID,
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

function tileUrl(z: number, x: number, y: number) {
  return WINE_REGION_REMOTE_TILE_TEMPLATE
    .replace("{z}", String(z))
    .replace("{y}", String(y))
    .replace("{x}", String(x));
}

async function loadSubregionTiles(zoom: number): Promise<Tile[]> {
  const raw = await readFile(path.resolve("src", "data", "wine-subregions.geojson"), "utf8");
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

  console.log(`Downloading ${tasks.length} tiles for wine subregions MID tier at z=${options.zoom}`);

  await runPool(tasks, options.concurrency, async ({ z, x, y }) => {
    const outputDir = path.resolve("public", "tiles", "wine-subregions-mid", String(z), String(x));
    const outputFile = path.join(outputDir, `${y}.${WINE_REGION_TILE_FORMAT}`);

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
