import { JsVizGeoJsonIndex } from "./js-geojson-index";

import type { VizGeoJsonFeatureCollection } from "../types";

export class WasmVizGeoJsonIndex<
  TProperties = Record<string, unknown>,
> extends JsVizGeoJsonIndex<TProperties> {
  constructor(featureCollection: VizGeoJsonFeatureCollection<TProperties>) {
    super(featureCollection);
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }
}
