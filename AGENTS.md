# AGENTS

## Purpose
This repository is a static, client-side wine-region map product (React + MapLibre + GeoJSON).
Agent work should prioritize:
- runtime performance (especially during pan/zoom),
- hierarchical focus correctness (country -> subregion -> detail),
- data integrity for region relationships.

## Architecture Snapshot
- App shell: `src/MapView.tsx`
- Shared runtime modules:
  - data loading: `src/lib/data.ts`
  - map style and raster pyramid: `src/lib/mapStyle.ts`
  - map creation defaults: `src/lib/mapFactory.ts`
  - geometry helpers: `src/lib/geo.ts`
  - region indexes/bounds: `src/lib/regionIndex.ts`
  - focus graph/hash: `src/lib/focus.ts`
  - focus runtime state transitions: `src/lib/focusState.ts`
  - layer visibility control: `src/lib/layerVisibility.ts`
  - waypoint visibility control: `src/lib/waypointVisibility.ts`
  - mask polygon selection: `src/lib/maskSelection.ts`
  - single-map outside-region compositing: `src/lib/focusMask.ts` + `addFocusMaskLayers`/`setFocusMaskData` in `src/lib/layers.ts`

## Data Contracts
- Top-level regions: `src/data/regions.geojson`
  - each feature must have `properties.iso_a3`
- Subregions: `src/data/france-wine-subregions.geojson` (legacy filename, global content)
  - each feature must have `properties.slug` and `properties.parent_iso_a3`
- Detail regions: `src/data/burgundy-detail-subregions.geojson` (legacy filename, multi-parent content)
  - each feature must have `properties.slug` and `properties.parent_slug`
- Explicit waypoints: `src/data/burgundy-waypoints.geojson`
  - `properties.parent_node_id` should be `region:*`, `subregion:*`, or `detail:*`
- Leaf grape profiles: `src/data/leaf-grape-profiles.ts`
  - keyed by leaf `node_id`
  - merged onto runtime region/hierarchy feature properties as:
    - `leaf_is_leaf`
    - `leaf_grapes`
    - `leaf_grapes_text`
    - `leaf_sources`

## Quality Gates (Required Before Merge)
Run all:
```bash
npm run typecheck
npm run validate:data
npm run test -- --run
npm run build
```

Or one command:
```bash
npm run quality
```

## Common Agent Tasks
- Rebuild subregions from OSM:
```bash
npm run build-wine-subregions
```
- Rebuild detail regions:
```bash
npm run build-wine-detail
```
- Refresh top-level country borders:
```bash
npm run refresh-borders
```
- Fetch imagery tiles:
```bash
npm run download-tiles
npm run download-subregion-mid-tiles -- --zoom 9
npm run download-subregion-tiles
```

## Implementation Rules
- Keep hierarchy behavior generic. Do not add level-specific one-off logic if it can be expressed through shared focus/layer modules.
- Keep expensive per-frame logic out of React state updates.
- Maintain single-renderer architecture (one MapLibre instance). Do not reintroduce multi-map camera-sync stacks.
- Prefer pure helper modules with tests when adding behavior.
- Update `.llms/REQUIREMENTS.md` and `.llms/WINE_SUBREGIONS_SOURCES.md` when behavior or data source assumptions change.
