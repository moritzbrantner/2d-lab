import { GeoJsonIndex } from "@mb-rust/geo-viz-core-wasm";

import type {
  VizGeoBounds,
  VizGeoJsonFeatureCollection,
  VizGeoJsonIndex,
  VizGeoJsonOptions,
  VizGeoJsonViewport,
  VizGeoViewportQuery,
} from "../types";

type WasmGeoJsonIndex = InstanceType<typeof GeoJsonIndex>;

export class WasmVizGeoJsonIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoJsonIndex<TProperties> {
  private readonly index: WasmGeoJsonIndex;

  constructor(featureCollection: VizGeoJsonFeatureCollection<TProperties>) {
    this.index = new GeoJsonIndex(featureCollection) as WasmGeoJsonIndex;
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

  getViewportFeatures(
    query: VizGeoViewportQuery,
    options: VizGeoJsonOptions = {},
  ): VizGeoJsonViewport<TProperties> {
    return this.index.getViewportFeatures(query, options) as VizGeoJsonViewport<TProperties>;
  }
}
