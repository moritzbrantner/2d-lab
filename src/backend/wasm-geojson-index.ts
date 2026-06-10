import type {
  VizGeoBounds,
  VizGeoJsonFeatureCollection,
  VizGeoJsonIndex,
  VizGeoJsonOptions,
  VizGeoJsonViewport,
  VizGeoViewportQuery,
} from "../types";
import type { VizWasmModule } from "../wasm/types";

type GeoJsonIndex = {
  free?: () => void;
  getBounds(): unknown;
  getViewportFeatures(query: unknown, options: unknown): unknown;
};
type GeoJsonIndexConstructor = new (featureCollection: unknown) => GeoJsonIndex;

export class WasmVizGeoJsonIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoJsonIndex<TProperties> {
  private readonly inner: GeoJsonIndex;
  private disposed = false;

  constructor(
    featureCollection: VizGeoJsonFeatureCollection<TProperties>,
    wasmModule: Pick<VizWasmModule, "GeoJsonIndex" | "initVizEngineWasm">,
  ) {
    wasmModule.initVizEngineWasm();
    const GeoJson = wasmModule.GeoJsonIndex as GeoJsonIndexConstructor;

    this.inner = new GeoJson(featureCollection);
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

  getViewportFeatures(
    query: VizGeoViewportQuery,
    options: VizGeoJsonOptions = {},
  ): VizGeoJsonViewport<TProperties> {
    return this.inner.getViewportFeatures(query, options) as VizGeoJsonViewport<TProperties>;
  }
}
