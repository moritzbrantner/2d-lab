import type {
  VizGeoBounds,
  VizGeoFlow,
  VizGeoFlowAggregation,
  VizGeoFlowIndex,
  VizGeoFlowOptions,
  VizGeoViewportQuery,
} from "../types";
import type { VizWasmModule } from "../wasm/types";

type GeoFlowIndex = {
  free?: () => void;
  getBounds(): unknown;
  getViewportFlows(query: unknown, options: unknown): unknown;
};
type GeoFlowIndexConstructor = new (flows: unknown) => GeoFlowIndex;

export class WasmVizGeoFlowIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoFlowIndex<TProperties> {
  private readonly inner: GeoFlowIndex;
  private disposed = false;

  constructor(
    flows: readonly VizGeoFlow<TProperties>[],
    wasmModule: Pick<VizWasmModule, "GeoFlowIndex" | "initVizEngineWasm">,
  ) {
    wasmModule.initVizEngineWasm();
    const GeoFlow = wasmModule.GeoFlowIndex as GeoFlowIndexConstructor;

    this.inner = new GeoFlow(flows as Array<VizGeoFlow<TProperties>>);
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "rust-geo-viz-wasm" as const,
      usesWasm: true,
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.inner.free?.();
    this.disposed = true;
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
