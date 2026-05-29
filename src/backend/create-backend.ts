import { JsVizDensityIndex } from "./js-density-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { WasmVizDensityIndex } from "./wasm-density-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";

import type { VizBackendOption, VizDataset, VizDatasetIndex, VizEngineBackend } from "../types";

export function createVizEngineBackend<TProperties = Record<string, unknown>>(
  option: VizBackendOption,
): VizEngineBackend<TProperties> {
  return {
    createIndex(dataset: VizDataset<TProperties>) {
      if (dataset.kind === "geo-points") {
        switch (option) {
          case "js":
            return {
              index: new JsVizGeoPointIndex(dataset.points),
              kind: "geo-points",
            };
          case "wasm":
          case "auto":
            return {
              index: new WasmVizGeoPointIndex(dataset.points),
              kind: "geo-points",
            };
        }
      }

      if (dataset.kind === "geojson") {
        return { kind: "geojson" };
      }

      if (dataset.kind === "geo-flows") {
        return { kind: "geo-flows" };
      }

      switch (option) {
        case "js":
          return {
            index: new JsVizDensityIndex(dataset.points),
            kind: "xy",
          };
        case "wasm":
          return {
            index: new WasmVizDensityIndex(dataset.points),
            kind: "xy",
          };
        case "auto":
          return {
            index: new ProgressiveVizDensityIndex(dataset.points),
            kind: "xy",
          };
      }
    },
    option,
    resolveBackend(index: VizDatasetIndex<TProperties>): "js" | "wasm" {
      if (index.kind === "xy" || index.kind === "geo-points") {
        return index.index.getBackendCapabilities().backend;
      }

      return "js";
    },
  };
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
