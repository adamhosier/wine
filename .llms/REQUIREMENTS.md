# REQUIREMENTS

## Goal
Static GitHub Pages app: slippy world map with NASA cloudless imagery, region overlays, and no backend/persistence.

## Stack
- Vite + React + TypeScript
- MapLibre GL JS
- Runtime architecture modularization:
  - `src/lib/data.ts` for lazy GeoJSON asset loading
  - `src/lib/layers.ts` for MapLibre source/layer wiring
  - `src/lib/mapFactory.ts` for shared map instantiation defaults
  - `src/lib/maskRenderer.ts` for region mask rendering/scheduling
  - `src/lib/maskGeometry.ts` for reusable mask triangulation/projection prep
  - `src/lib/regionIndex.ts` + `src/lib/debug.ts` for pure map-index/debug derivation helpers
  - `src/lib/focusState.ts`, `src/lib/layerVisibility.ts`, `src/lib/waypointVisibility.ts`, `src/lib/maskSelection.ts` for shared tree/focus UI behavior

## Imagery and tiles
- NASA GIBS EPSG:3857 XYZ URL (`BlueMarble_ShadedRelief_Bathymetry`, `GoogleMapsCompatible_Level8`)
- Constants/time in `src/config.ts`
- Runtime data loading uses asset URLs (`?url`) + fetch to avoid embedding large GeoJSON in initial JS bundle
- Local France hi-res cache in `public/tiles/france/{z}/{x}/{y}.jpg`
- Local wine-subregion mid-res cache in `public/tiles/france-subregions-mid/{z}/{x}/{y}.jpg` (legacy path name)
- Local wine-subregion ultra-hi-res cache in `public/tiles/france-subregions/{z}/{x}/{y}.jpg` (legacy path name)
- Runtime raster pyramid:
  - NASA global base
  - France local tier at `z >= Z_HI` (currently z8)
  - Wine subregion mid tier at `z >= Z_SUBREGION_MID` and `< Z_SUBREGION_HI` (currently z7.5-z10)
    - tile source: local cache first, ArcGIS World Imagery fallback
  - Wine subregion ultra tier at `z >= Z_SUBREGION_HI` (currently z11+)
    - tile source: local cache first, ArcGIS World Imagery fallback
- Processed/background map render cost reduction:
  - processed layer uses NASA-only raster tier (normal/high-res tiers stay on the normal/color layer)
  - raster cross-fade disabled on local/remote subregion tiers to reduce zoom transition latency
  - France and wine tier bounds are computed from loaded geometry at runtime (not fixed global envelope)
- Tile fetch script: `scripts/download-tiles.ts`
- Subregion mid tile fetch script: `scripts/download-subregion-mid-tiles.ts`
- Subregion tile fetch script: `scripts/download-subregion-tiles.ts`

## Borders and region data
- Open data source: Natural Earth 10m admin-0 countries
- Local all-country source of truth: `src/data/countries.geojson`
- Active runtime regions in `src/data/regions.geojson`:
  - France, Italy, Germany, Spain, Portugal, California, Oregon, Chile, Argentina, South Africa, Australia, New Zealand
- Country scope overrides for this tool:
  - France: metropolitan mainland only, Corsica excluded, overseas excluded
  - United States: contiguous mainland only (Alaska, Hawaii, territories excluded)
  - New Zealand: main islands only (offshore islands excluded)
  - South Africa: mainland only (offshore islands excluded)
  - Spain: mainland only (offshore islands excluded)
  - Portugal: mainland only (offshore islands excluded)
  - Chile: mainland only (offshore islands excluded)
  - Australia: mainland + Tasmania only
- Refresh script: `scripts/refresh-borders.ts`
- Wine subregions in `src/data/france-wine-subregions.geojson` (legacy filename; now global):
  - France: champagne, loire, burgundy, beaujolais, rhone, alsace, bordeaux, provence, languedoc-roussillon
  - Italy: puglia, piemonte, veneto, tuscany, marche, abruzzo, campania, prosecco
  - Germany: pfalz, mosel, rheingau
  - Spain: rioja, navarra, ribera-del-duero, catalunya, rias-baixas, jerez
  - Portugal: port
  - California top-level region: napa, sonoma, los-carneros, santa-barbara-county
  - Oregon top-level region: (no children yet)
  - Chile: casablanca-valley, central-valley
  - Argentina: mendoza
  - South Africa: western-cape
  - Australia: south-australia, new-south-wales, victoria, tasmania, western-australia
  - New Zealand: martinborough, marlborough, central-otago, hawkes-bay
  - single source: OpenStreetMap via Nominatim polygon search (ODbL)
  - single plotting pipeline for all subregions:
    - candidate scoring from OSM polygon results
    - clip to parent country geometry
    - uniform simplify pass
    - deterministic overlap trimming between sibling subregions
  - proxy query notes:
    - rhone is built from OSM proxy union (`Rhone` + `Drome` + `Vaucluse` + `Ardeche`)
    - bordeaux is built from OSM `Gironde` proxy
  - Detail level in `src/data/burgundy-detail-subregions.geojson` (legacy filename; now multi-parent):
    - Burgundy: cote-de-nuits, cote-de-beaune, chablis, maconnais
    - Loire: vouvray, touraine, sancerre, pouilly-fume
    - Beaujolais: fleurie
    - Bordeaux: sauternes, pessac-leognan, graves, pauillac, haut-medoc, margaux, pomerol, saint-emilion
    - Rhone: condrieu, cote-rotie, hermitage, crozes-hermitage, chateauneuf-du-pape
    - Western Cape: walker-bay, constantia, elgin, stellenbosch
    - Napa: rutherford, oakville
    - Central Valley (Chile): colchagua-valley, maipo-valley
    - Catalunya: priorat
    - Piemonte: gavi, barolo, barbaresco, barbera-dasti, asti
    - Veneto: soave, valpolicella
    - Marche: verdicchio-dei-castelli-di-jesi
    - Campania: fiano-di-avellino
    - Tuscany: chianti, brunello-di-montalcino
    - Abruzzo: montepulciano-dabruzzo
    - South Australia: clare-valley, eden-valley, barossa-valley, adelaide-hills, coonawarra, mclaren-vale
    - New South Wales: hunter-valley
    - Victoria: yarra-valley, mornington-peninsula
    - Western Australia: margaret-river
    - common method: OSM candidate scoring -> clip to parent subregion -> simplify -> sibling de-overlap
  - Burgundy village waypoints (prototype POIs) remain in `src/data/burgundy-waypoints.geojson`
- Subregion source attribution is tracked in `.llms/WINE_SUBREGIONS_SOURCES.md`
- Subregion build script: `scripts/build-wine-subregions-osm.ts` (invoked via `npm run build-wine-subregions` or `npm run build-france-subregions`)
- Detail build script: `scripts/build-wine-detail-subregions.ts` (invoked via `npm run build-wine-detail` or `npm run build-burgundy-detail`)

## Visual behavior
- Two-pass imagery:
  1. Full-world processed layer (greyscale + subtle blur)
  2. Normal-color layer clipped by region mask
- Soft edge on region mask boundary
- Outlines always visible when no focused region: ruby/brown, 2px, no glow/shadow
- When a region is focused, only that region is highlighted (normal-color); all other regions remain in processed/desaturated view
- Subregions display only for the currently focused parent region
- Implicit polygon text labels are disabled for subregions/details; explicit POI markers/labels are the canonical labels
- Crisp custom attribution badge (not blurred)

## Interaction
- Initial load camera is world-scale
- Smooth pan/zoom
- Focus hierarchy behavior:
  - focus is modeled as a generic node tree (country -> subregion -> detail -> ...)
  - shared focus handlers apply to every depth (no per-level duplicated logic):
    - click focuses a node with `fitBounds`
    - URL hash parses to deepest valid node (`#france-burgundy-cote-de-nuits`, etc.)
    - focusing updates URL hash deterministically from node ancestry
  - focus is click-driven only (no automatic focus changes on pan/zoom)
  - zooming out pops exactly one level only when zoom drops below the current focused node's fit zoom (with small leeway)
- URL hash shortcuts for focus:
  - `#france`
  - `#italy`
  - `#germany`
  - `#california`
  - `#oregon`
  - `#australia`
  - `#new-zealand`
  - hierarchical bookmarks are supported:
    - `#france-burgundy`
    - `#france-burgundy-cote-de-nuits` (and other Burgundy detail slugs)
    - `#california-napa`
    - `#california-napa-rutherford`
    - `#australia-victoria-yarra-valley`
- Focus is deterministic and canonical (resolved via stable region identifiers, not transient rendered fragment ids)
- Hash changes should apply focus; focusing a region should update URL hash

## UI
- Debug overlay includes zoom, center, tile source, and focused region
- Globe/zoomed-out waypoints:
  - derive marker points from subregion geometry centers (no hardcoded city list)
  - show only when unfocused and zoomed out
  - hide when region focus is active or camera is zoomed in
- Region-focused waypoints:
  - POIs are treated as children of parent focus nodes and shown only when that parent is focused without a deeper focused child

## Non-functional
- No backend
- No user data storage
- Keep dependencies minimal
- Runtime performance constraints:
  - throttle mask redraws to animation frames instead of every render frame
  - cache polygon triangulation for the mask pipeline and only re-project camera-space vertices per frame
  - coalesce move-driven UI updates (debug + waypoint visibility + mask schedule) into one animation-frame task
  - only recompute waypoint layer visibility/filter when effective state changes
  - use map tile request tuning (`cancelPendingTileRequestsWhileZooming`, larger tile cache zoom levels, disabled expired-tile refresh)
  - avoid duplicated per-level (country/subregion/detail) logic by routing focus and layer state through shared helpers
  - remove duplicated helper logic in scripts via shared libs:
    - `scripts/lib/tiles.ts`
    - `scripts/lib/geo-ops.ts`
    - `scripts/lib/async.ts`
- Production quality gates:
  - `npm run typecheck`
  - `npm run validate:data`
  - `npm run test -- --run`
  - `npm run build`
- CI:
  - `.github/workflows/ci.yml` runs full quality checks on push/PR
  - `.github/workflows/deploy.yml` runs type/data/test checks before Pages publish

## Key files
- `AGENTS.md`
- `src/MapView.tsx`
- `src/config.ts`
- `src/lib/data.ts`
- `src/lib/layers.ts`
- `src/lib/mapFactory.ts`
- `src/lib/maskRenderer.ts`
- `src/lib/maskGeometry.ts`
- `src/lib/regionIndex.ts`
- `src/lib/debug.ts`
- `src/lib/focusState.ts`
- `src/lib/layerVisibility.ts`
- `src/lib/waypointVisibility.ts`
- `src/lib/maskSelection.ts`
- `src/lib/focus.ts`
- `src/lib/geo.ts`
- `src/lib/mapStyle.ts`
- `src/lib/waypoints.ts`
- `src/data/regions.geojson`
- `src/data/countries.geojson`
- `src/data/france-wine-subregions.geojson`
- `src/data/burgundy-detail-subregions.geojson`
- `src/data/burgundy-waypoints.geojson`
- `scripts/download-tiles.ts`
- `scripts/download-subregion-mid-tiles.ts`
- `scripts/download-subregion-tiles.ts`
- `scripts/refresh-borders.ts`
- `scripts/build-wine-subregions-osm.ts`
- `scripts/build-wine-detail-subregions.ts`
- `scripts/validate-data.ts`
- `scripts/lib/tiles.ts`
- `scripts/lib/geo-ops.ts`
- `scripts/lib/async.ts`
- `.llms/WINE_SUBREGIONS_SOURCES.md`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
