/// <reference types="vite/client" />

import type { FeatureCollection } from "geojson";

declare module "*.geojson" {
  const value: FeatureCollection;
  export default value;
}
