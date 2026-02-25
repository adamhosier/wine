import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FRANCE_BBOX, NASA_LAYER, NASA_TILE_FORMAT, NASA_TILE_MATRIX_SET, NASA_TIME, Z_HI } from "../src/config.js";
import { fileExists, runPool, tileRangeForBbox } from "./lib/tiles.js";

type CliOptions = {
  zoom: number;
  overwrite: boolean;
  concurrency: number;
};

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    zoom: Z_HI,
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
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/${NASA_TIME}/${NASA_TILE_MATRIX_SET}/${z}/${y}/${x}.${NASA_TILE_FORMAT}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { xMin, xMax, yMin, yMax } = tileRangeForBbox(FRANCE_BBOX, options.zoom);
  const tasks: Array<{ z: number; x: number; y: number }> = [];
  for (let x = xMin; x <= xMax; x += 1) {
    for (let y = yMin; y <= yMax; y += 1) {
      tasks.push({ z: options.zoom, x, y });
    }
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Downloading ${tasks.length} tiles for France bbox at z=${options.zoom} (x ${xMin}-${xMax}, y ${yMin}-${yMax})`,
  );

  await runPool(tasks, options.concurrency, async ({ z, x, y }) => {
    const outputDir = path.resolve("public", "tiles", "france", String(z), String(x));
    const outputFile = path.join(outputDir, `${y}.${NASA_TILE_FORMAT}`);

    if (!options.overwrite && (await fileExists(outputFile))) {
      skipped += 1;
      return;
    }

    const response = await fetch(tileUrl(z, x, y));
    if (!response.ok) {
      failed += 1;
      console.warn(`Failed ${z}/${x}/${y}: ${response.status}`);
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
