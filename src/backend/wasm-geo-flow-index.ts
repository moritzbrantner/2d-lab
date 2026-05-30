import { GeoFlowIndex } from "@mb-rust/geo-viz-wasm";

import type {
  VizGeoBounds,
  VizGeoFlow,
  VizGeoFlowAggregation,
  VizGeoFlowIndex,
  VizGeoFlowOptions,
  VizGeoViewportQuery,
} from "../types";

type WasmGeoFlowIndex = InstanceType<typeof GeoFlowIndex>;

export class WasmVizGeoFlowIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoFlowIndex<TProperties> {
  private readonly index: WasmGeoFlowIndex;

  constructor(flows: readonly VizGeoFlow<TProperties>[]) {
    this.index = new GeoFlowIndex(
      flows.map((flow) => ({
        from: flow.from,
        id: flow.id,
        label: flow.label,
        metrics: flow.metrics ?? {},
        properties: flow.properties ?? {},
        to: flow.to,
      })),
    ) as WasmGeoFlowIndex;
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "legacy-wasm" as const,
      usesWasm: true,
    };
  }

  getBounds(): VizGeoBounds | null {
    return this.index.getBounds() as VizGeoBounds | null;
  }

  getViewportFlows(
    query: VizGeoViewportQuery,
    options: VizGeoFlowOptions = {},
  ): VizGeoFlowAggregation<TProperties> {
    return this.index.getViewportFlows(query, options) as VizGeoFlowAggregation<TProperties>;
  }
}
