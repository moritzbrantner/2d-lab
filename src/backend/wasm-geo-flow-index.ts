import { GeoFlowIndex, initVizEngineWasm } from "../wasm/viz-engine-wasm-bindings";

import type {
  VizGeoBounds,
  VizGeoFlow,
  VizGeoFlowAggregation,
  VizGeoFlowIndex,
  VizGeoFlowOptions,
  VizGeoViewportQuery,
} from "../types";

export class WasmVizGeoFlowIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoFlowIndex<TProperties> {
  private readonly inner: GeoFlowIndex;

  constructor(flows: readonly VizGeoFlow<TProperties>[]) {
    initVizEngineWasm();

    this.inner = new GeoFlowIndex(flows as Array<VizGeoFlow<TProperties>>);
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "rust-geo-viz-wasm" as const,
      usesWasm: true,
    };
  }

  getBounds(): VizGeoBounds | null {
    return this.inner.getBounds() as VizGeoBounds | null;
  }

  getViewportFlows(
    query: VizGeoViewportQuery,
    options: VizGeoFlowOptions = {},
  ): VizGeoFlowAggregation<TProperties> {
    return this.inner.getViewportFlows(query, options) as VizGeoFlowAggregation<TProperties>;
  }
}
