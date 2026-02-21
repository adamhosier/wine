# REQUIREMENTS

## Goal
Static GitHub Pages app: slippy world map with NASA cloudless imagery, region overlays, and no backend/persistence.

## Stack
- Vite + React + TypeScript
- MapLibre GL JS

## Imagery and tiles
- NASA GIBS EPSG:3857 XYZ URL (`BlueMarble_ShadedRelief_Bathymetry`, `GoogleMapsCompatible_Level8`)
- Constants/time in `src/config.ts`
- Local France hi-res cache in `public/tiles/france/{z}/{x}/{y}.jpg`
- Runtime uses local France tiles at high zoom in France bbox, NASA fallback elsewhere
- Tile fetch script: `scripts/download-tiles.ts`

## Borders and region data
- Open data source: Natural Earth 10m admin-0 countries
- Local all-country source of truth: `src/data/countries.geojson`
- Active runtime regions in `src/data/regions.geojson`: France + Italy
- France scope for this tool: metropolitan mainland only, Corsica excluded, overseas excluded
- Refresh script: `scripts/refresh-borders.ts`

## Visual behavior
- Two-pass imagery:
  1. Full-world processed layer (greyscale + subtle blur)
  2. Normal-color layer clipped by region mask
- Soft edge on region mask boundary
- Outlines always visible when no focused region: ruby/brown, 2px, no glow/shadow
- When a region is focused, only that region is highlighted (normal-color); all other regions remain in processed/desaturated view
- Crisp custom attribution badge (not blurred)

## Interaction
- Initial load camera is world-scale
- Smooth pan/zoom
- Focus hierarchy behavior:
  - click a region to focus in (`fitBounds`) to that region node
  - zoom out while focused to focus out to parent/root (global view)
- URL hash shortcuts for focus:
  - `#france`
  - `#italy`
- Focus is deterministic and canonical (resolved via stable region identifiers, not transient rendered fragment ids)
- Hash changes should apply focus; focusing a region should update URL hash

## UI
- Debug overlay includes zoom, center, tile source, and focused region

## Non-functional
- No backend
- No user data storage
- Keep dependencies minimal

## Key files
- `src/MapView.tsx`
- `src/config.ts`
- `src/data/regions.geojson`
- `src/data/countries.geojson`
- `scripts/download-tiles.ts`
- `scripts/refresh-borders.ts`
- `.github/workflows/deploy.yml`
