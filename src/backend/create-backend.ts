import { JsVizDensityIndex } from "./js-density-index";
import { JsVizFinanceIndex } from "./js-finance-index";
import { JsVizGeoFlowIndex } from "./js-geo-flow-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { JsVizGeoJsonIndex } from "./js-geojson-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";

import type { VizBackendOption, VizDataset, VizDatasetIndex, VizEngineBackend } from "../types";

export function createVizEngineBackend<TProperties = Record<string, unknown>>(
  option: VizBackendOption,
): VizEngineBackend<TProperties> {
  return {
    createIndex(dataset: VizDataset<TProperties>) {
      return createDatasetIndex(dataset, option);
    },
    option,
    resolveBackend(index: VizDatasetIndex<TProperties>): "js" | "wasm" {
      return index.index.getBackendCapabilities().backend;
    },
  };
}

function createDatasetIndex<TProperties>(
  dataset: VizDataset<TProperties>,
  option: VizBackendOption,
): VizDatasetIndex<TProperties> {
  switch (dataset.kind) {
    case "geo-points":
      return {
        index:
          option === "js"
            ? new JsVizGeoPointIndex(dataset.points)
            : new WasmVizGeoPointIndex(dataset.points),
        kind: "geo-points",
      };
    case "geojson":
      return {
        index:
          option === "js"
            ? new JsVizGeoJsonIndex(dataset.featureCollection)
            : new WasmVizGeoJsonIndex(dataset.featureCollection),
        kind: "geojson",
      };
    case "geo-flows":
      return {
        index:
          option === "js"
            ? new JsVizGeoFlowIndex(dataset.flows)
            : new WasmVizGeoFlowIndex(dataset.flows),
        kind: "geo-flows",
      };
    case "finance-ohlcv":
      return {
        index: option === "js" ? new JsVizFinanceIndex(dataset) : new WasmVizFinanceIndex(dataset),
        kind: "finance-ohlcv",
      };
    case "xy":
      return {
        index:
          option === "js"
            ? new JsVizDensityIndex(dataset.points)
            : option === "wasm"
              ? new RustWasmVizDensityIndex(dataset.points)
              : new ProgressiveVizDensityIndex(dataset.points),
        kind: "xy",
      };
  }
}

export function resolveFrameBackend<TProperties>(
  backend: VizEngineBackend<TProperties>,
  indexes: Array<VizDatasetIndex<TProperties>>,
) {
  const backends = new Set(indexes.map((index) => backend.resolveBackend(index)));

  if (backends.size > 1) {
    return "mixed" as const;
  }

  return backends.has("wasm") ? ("wasm" as const) : ("js" as const);
}

export function resolveFrameBackendImplementation<TProperties>(
  indexes: Array<VizDatasetIndex<TProperties>>,
) {
  const implementations = new Set(
    indexes.map((index) => {
      const capabilities = index.index.getBackendCapabilities();

      return capabilities.implementation ?? (capabilities.backend === "js" ? "js" : "legacy-wasm");
    }),
  );

  if (implementations.size > 1) {
    return "mixed" as const;
  }

  return implementations.values().next().value ?? ("js" as const);
}
