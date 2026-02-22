# NASA Regions Map

Static React + MapLibre app that renders NASA GIBS cloudless imagery with regional masking:

- Smooth slippy-map pan/zoom
- France + Italy vector outlines and point labels
- Outside the regions: greyscale + subtle blur
- Inside the regions: full-color imagery
- France high-zoom local tiles from `public/tiles/france/...` with NASA fallback
- Wine subregion mid-zoom tiles from `public/tiles/france-subregions-mid/...`
- Wine subregion ultra-high zoom tiles from `public/tiles/france-subregions/...` with local/remote fallback

## Run locally

```bash
npm install
npm run download-tiles
npm run download-subregion-mid-tiles -- --zoom 9
npm run download-subregion-mid-tiles -- --zoom 10
npm run download-subregion-tiles
npm run dev
```

## Build

```bash
npm run build
```

## Download France local tiles

```bash
npm run download-tiles
```

Optional flags:

- `--zoom 8` (default from `src/config.ts`)
- `--concurrency 8`
- `--overwrite`

## Download wine subregion ultra-high tiles

```bash
npm run download-subregion-tiles
```

Optional flags:

- `--zoom 11` (default from `src/config.ts`)
- `--concurrency 8`
- `--overwrite`

## Download wine subregion mid tiles

```bash
npm run download-subregion-mid-tiles -- --zoom 9
npm run download-subregion-mid-tiles -- --zoom 10
```

Notes:

- Subregion high-zoom imagery uses ArcGIS World Imagery tile endpoints.
- Runtime source order for subregion layer is local cache first, remote fallback second.

## Refresh Country Borders (Higher Resolution)

Downloads Natural Earth 10m country borders (open data), stores all countries locally, and regenerates the active regions file:

```bash
npm run refresh-borders
```

Outputs:

- `src/data/countries.geojson` (all countries, local source of truth)
- `src/data/regions.geojson` (currently filtered to France + Italy)

## Build France Wine Subregions

Generate `src/data/france-wine-subregions.geojson` from the canonical OSM-based source pipeline:

```bash
npm run build-france-subregions
```

Source attribution and mapping notes are documented in:

- `.llms/WINE_SUBREGIONS_SOURCES.md`

## GitHub Pages

The repo includes a Pages workflow in `.github/workflows/deploy.yml` that builds and publishes `dist/`.
It sets `VITE_BASE_PATH` to `/<repo-name>/` during CI so assets resolve correctly on Pages.
