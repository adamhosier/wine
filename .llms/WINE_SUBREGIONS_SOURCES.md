# Wine Region Geometry Sources

## Scope
- Source: OpenStreetMap via Nominatim polygon search
- Endpoint: `https://nominatim.openstreetmap.org/search`
- License: ODbL 1.0
- Subregion builder: `scripts/build-wine-subregions-osm.ts`
- Detail builder: `scripts/build-wine-detail-subregions.ts`
- Subregion output: `src/data/france-wine-subregions.geojson` (legacy filename, global content)
- Detail output: `src/data/burgundy-detail-subregions.geojson` (legacy filename, multi-parent content)

## Common Geometry Pipeline
- Query candidate polygons from Nominatim
- Score/select best polygon per query
- Union per region definition when multiple queries are used
- Clip to parent geometry (country for subregions, subregion for details)
- Simplify with shared tolerance
- Deterministic sibling overlap trimming in fixed order

## Country Regions
- `FRA` France
- `ITA` Italy
- `DEU` Germany
- `CAL` California (top-level region node)
- `ORE` Oregon (top-level region node)
- `CHL` Chile
- `ARG` Argentina
- `ZAF` South Africa
- `AUS` Australia
- `NZL` New Zealand
- `ESP` Spain
- `PRT` Portugal

## Subregions (Country -> Slug)
- France: `champagne`, `loire`, `burgundy`, `beaujolais`, `rhone`, `alsace`, `bordeaux`, `provence`, `languedoc-roussillon`
- Italy: `puglia`, `piemonte`, `veneto`, `tuscany`, `marche`, `abruzzo`, `campania`, `prosecco`
- Germany: `pfalz`, `mosel`, `rheingau`
- California: `napa`, `sonoma`, `los-carneros`, `santa-barbara-county`
- Oregon: none yet
- Chile: `casablanca-valley`, `central-valley`
- Argentina: `mendoza`
- South Africa: `western-cape`
- Australia: `south-australia`, `new-south-wales`, `victoria`, `tasmania`, `western-australia`
- New Zealand: `martinborough`, `marlborough`, `central-otago`, `hawkes-bay`
- Spain: `rioja`, `navarra`, `ribera-del-duero`, `catalunya`, `rias-baixas`, `jerez`
- Portugal: `port`

## Notes on Proxy/Union Regions
- `rhone`: proxy union of `Rhone` + `Drome` + `Vaucluse` + `Ardeche`
- `bordeaux`: proxy via `Gironde`
- `central-valley` (Chile): proxy union of `Maule Region` + `Santiago Metropolitan Region` (O'Higgins fallback query retained in builder)
- `pfalz`: proxy union of county/city boundaries (`Bad Duerkheim`, `Suedliche Weinstrasse`, `Neustadt an der Weinstrasse`, `Landau in der Pfalz`)
- `mosel`: proxy union of `Bernkastel-Wittlich`, `Cochem-Zell`, `Trier-Saarburg`

## Detail Subregions (Parent Subregion -> Slug)
- Burgundy: `cote-de-nuits`, `cote-de-beaune`, `chablis`, `maconnais`
- Loire: `vouvray`, `touraine`, `sancerre`, `pouilly-fume`
- Beaujolais: `fleurie`
- Bordeaux: `sauternes`, `pessac-leognan`, `graves`, `pauillac`, `haut-medoc`, `margaux`, `pomerol`, `saint-emilion`
- Rhone: `condrieu`, `cote-rotie`, `hermitage`, `crozes-hermitage`, `chateauneuf-du-pape`
- Western Cape: `walker-bay`, `constantia`, `elgin`, `stellenbosch` (elgin proxy via `Theewaterskloof Local Municipality`)
- Napa: `rutherford`, `oakville`
- Central Valley: `colchagua-valley`, `maipo-valley`
- Catalunya: `priorat`
- Piemonte: `gavi`, `barolo`, `barbaresco`, `barbera-dasti`, `asti`
- Veneto: `soave`, `valpolicella`
- Marche: `verdicchio-dei-castelli-di-jesi`
- Campania: `fiano-di-avellino`
- Tuscany: `chianti`, `brunello-di-montalcino`
- Abruzzo: `montepulciano-dabruzzo`
- South Australia: `clare-valley`, `eden-valley`, `barossa-valley`, `adelaide-hills`, `coonawarra`, `mclaren-vale`
- New South Wales: `hunter-valley`
- Victoria: `yarra-valley`, `mornington-peninsula`
- Western Australia: `margaret-river`

## Leaf Grape Profile Sources (WSET Level 2)
- Data file: `src/data/leaf-grape-profiles.ts`
- Coverage: all current WSET Level 2 leaf nodes (79/79 at time of writing)
- Method:
  - Curated primary grape varieties per leaf node
  - Stored as data (not hardcoded in renderer) and merged into runtime feature properties
  - Percentages are derived from ordered grape prominence templates per node (deterministic heuristic), then rendered as grape composition breakdown
  - Shown via leaf-node info boxes in the map UI

### Primary source set used for regional grape profiles
- France regional/appellation references:
  - `https://www.bourgogne-wines.com/`
  - `https://www.vins-rhone.com/en`
  - `https://www.vins-bordeaux.fr/`
  - `https://www.champagne.fr/en`
  - `https://www.loirevalley-wines.com/`
- Italy:
  - `https://www.italianwinecentral.com/`
  - `https://www.winescholarguild.com/resource/italy/`
- Spain / Portugal:
  - `https://www.winesfromspain.com/`
  - `https://www.winesofportugal.com/en/`
- Germany:
  - `https://www.germanwines.de/`
- United States:
  - `https://www.wineinstitute.org/`
  - `https://winefolly.com/`
- Chile:
  - `https://www.winesofchile.org/`
- Argentina:
  - `https://www.winesofargentina.org/`
- South Africa:
  - `https://www.wosa.co.za/`
- Australia:
  - `https://www.wineaustralia.com/`
- New Zealand:
  - `https://www.nzwine.com/`
