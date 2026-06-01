import { GeoJsonIndex, initVizEngineWasm } from "../wasm/viz-engine-wasm-bindings";

import type {
  VizGeoBounds,
  VizGeoJsonFeatureCollection,
  VizGeoJsonIndex,
  VizGeoJsonOptions,
  VizGeoJsonViewport,
  VizGeoViewportQuery,
} from "../types";

export class WasmVizGeoJsonIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoJsonIndex<TProperties> {
  private readonly inner: GeoJsonIndex;

  constructor(featureCollection: VizGeoJsonFeatureCollection<TProperties>) {
    initVizEngineWasm();

    this.inner = new GeoJsonIndex(featureCollection);
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

  getViewportFeatures(
    query: VizGeoViewportQuery,
    options: VizGeoJsonOptions = {},
  ): VizGeoJsonViewport<TProperties> {
    return this.inner.getViewportFeatures(query, options) as VizGeoJsonViewport<TProperties>;
  }
}
