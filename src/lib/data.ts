import regionsGeoJsonUrl from "../data/regions.geojson?url";
import wineSubregionsGeoJsonUrl from "../data/france-wine-subregions.geojson?url";
import wineDetailGeoJsonUrl from "../data/burgundy-detail-subregions.geojson?url";
import waypointGeoJsonUrl from "../data/burgundy-waypoints.geojson?url";

export type RegionsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
export type SubregionsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
export type DetailFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
export type WaypointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;

export type RuntimeData = {
  regions: RegionsFeatureCollection;
  subregions: SubregionsFeatureCollection;
  details: DetailFeatureCollection;
  explicitWaypoints: WaypointFeatureCollection;
};

async function fetchGeoJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch data asset: ${url} (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function loadRuntimeData(): Promise<RuntimeData> {
  const [regions, subregions, details, explicitWaypoints] = await Promise.all([
    fetchGeoJson<RegionsFeatureCollection>(regionsGeoJsonUrl),
    fetchGeoJson<SubregionsFeatureCollection>(wineSubregionsGeoJsonUrl),
    fetchGeoJson<DetailFeatureCollection>(wineDetailGeoJsonUrl),
    fetchGeoJson<WaypointFeatureCollection>(waypointGeoJsonUrl),
  ]);
  return {
    regions,
    subregions,
    details,
    explicitWaypoints,
  };
}

