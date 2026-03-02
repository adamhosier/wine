# NASA Regions Map

Static React + MapLibre app that renders NASA GIBS cloudless imagery with regional masking:

- Smooth slippy-map pan/zoom
- Global wine-region hierarchy (country -> subregion -> detail)
- Inside active regions: full imagery emphasis
- Outside active regions: de-emphasized veil + soft edge haze (single-renderer compositing)
- Wine subregion mid-zoom tiles from `public/tiles/wine-subregions-mid/...`
- Wine subregion ultra-high zoom tiles from `public/tiles/wine-subregions/...` with local/remote fallback
- GeoJSON datasets are loaded as static assets at runtime (not bundled into the main JS chunk)
- In-app data source selector:
  - `WSET Level 2` (full hierarchy dataset)
  - `Depth Demo (UK)` (5-level hierarchy chain: UK -> England -> London -> Hackney -> Clissold Park)

## Local Development

```bash
npm install
npm run download-subregion-mid-tiles -- --zoom 9
npm run download-subregion-mid-tiles -- --zoom 10
npm run download-subregion-tiles
npm run dev
```

## Quality Gate

```bash
npm run quality
```

This runs:
- Type checking
- Data integrity checks
- Unit tests
- Production build

## Build

```bash
npm run build
```

Preview:

```bash
npm run preview
```

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
- `src/data/regions.geojson` (active top-level wine regions)

## Build Wine Subregions

Generate `src/data/wine-subregions.geojson` from the canonical OSM-based source pipeline:

```bash
npm run build-wine-subregions
```

Build detail-level regions (children of subregions):

```bash
npm run build-wine-detail
```

Source attribution and mapping notes are documented in:

- `.llms/WINE_SUBREGIONS_SOURCES.md`
- Agent runbook (architecture + workflows): `AGENTS.md`

## Data Validation

Validate hierarchy and key constraints in local GeoJSON data:

```bash
npm run validate:data
```

## GitHub Pages

The repo includes a Pages workflow in `.github/workflows/deploy.yml` that builds and publishes `dist/`.
It sets `VITE_BASE_PATH` to `/<repo-name>/` during CI so assets resolve correctly on Pages.
Client-side `/quiz` routing is supported on Pages via `public/404.html`, which redirects unknown paths back to the SPA entry and restores the intended pathname in-app.

## CI

`/.github/workflows/ci.yml` runs repository quality checks on push/PR:
- `npm run quality`
