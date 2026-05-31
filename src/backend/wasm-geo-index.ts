import { JsVizGeoPointIndex } from "./js-geo-index";

import type { VizGeoPoint } from "../types";

export class WasmVizGeoPointIndex<
  TProperties = Record<string, unknown>,
> extends JsVizGeoPointIndex<TProperties> {
  constructor(points: readonly VizGeoPoint<TProperties>[]) {
    super(points);
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }
}
