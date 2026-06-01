import { JsVizDensityIndex } from "./js-density-index";
import { JsVizFinanceIndex } from "./js-finance-index";
import { JsVizGeoFlowIndex } from "./js-geo-flow-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { JsVizGeoJsonIndex } from "./js-geojson-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";

import type {
  VizBackendConfig,
  VizBackendOption,
  VizDataset,
  VizDatasetIndex,
  VizEngineBackend,
} from "../types";

export function createVizEngineBackend<TProperties = Record<string, unknown>>(
  option: VizBackendOption | VizBackendConfig,
): VizEngineBackend<TProperties> {
  const config = normalizeBackendConfig(option);

  return {
    createIndex(dataset: VizDataset<TProperties>) {
      return createDatasetIndex(dataset, config);
    },
    option: config,
    resolveBackend(index: VizDatasetIndex<TProperties>): "js" | "wasm" {
      return index.index.getBackendCapabilities().backend;
    },
  };
}

function createDatasetIndex<TProperties>(
  dataset: VizDataset<TProperties>,
  config: Required<VizBackendConfig>,
): VizDatasetIndex<TProperties> {
  switch (dataset.kind) {
    case "geo-points":
      return {
        index:
          config.geo === "js"
            ? new JsVizGeoPointIndex(dataset.points)
            : new WasmVizGeoPointIndex(dataset.points),
        kind: "geo-points",
      };
    case "geojson":
      return {
        index:
          config.geo === "js"
            ? new JsVizGeoJsonIndex(dataset.featureCollection)
            : new WasmVizGeoJsonIndex(dataset.featureCollection),
        kind: "geojson",
      };
    case "geo-flows":
      return {
        index:
          config.geo === "js"
            ? new JsVizGeoFlowIndex(dataset.flows)
            : new WasmVizGeoFlowIndex(dataset.flows),
        kind: "geo-flows",
      };
    case "finance-ohlcv":
      return {
        index:
          config.finance === "js"
            ? new JsVizFinanceIndex(dataset)
            : new WasmVizFinanceIndex(dataset),
        kind: "finance-ohlcv",
      };
    case "xy":
      return {
        index:
          config.xy === "js" || isBrowserRuntime()
            ? new JsVizDensityIndex(dataset)
            : config.xy === "wasm"
              ? new RustWasmVizDensityIndex(dataset)
              : new ProgressiveVizDensityIndex(dataset),
        kind: "xy",
      };
  }
}

function normalizeBackendConfig(
  option: VizBackendOption | VizBackendConfig,
): Required<VizBackendConfig> {
  if (typeof option === "string") {
    return {
      finance: option,
      geo: option,
      xy: option,
    };
  }

  return {
    finance: option.finance ?? option.xy ?? "auto",
    geo: option.geo ?? option.xy ?? "auto",
    xy: option.xy ?? "auto",
  };
}

function isBrowserRuntime() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    !globalThis.navigator?.userAgent.toLowerCase().includes("jsdom")
  );
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
