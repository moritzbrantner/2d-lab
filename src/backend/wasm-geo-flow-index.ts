import { JsVizGeoFlowIndex } from "./js-geo-flow-index";

import type { VizGeoFlow } from "../types";

export class WasmVizGeoFlowIndex<
  TProperties = Record<string, unknown>,
> extends JsVizGeoFlowIndex<TProperties> {
  constructor(flows: readonly VizGeoFlow<TProperties>[]) {
    super(flows);
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }
}
