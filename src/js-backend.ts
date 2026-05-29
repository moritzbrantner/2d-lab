import {
  createChartDensityIndex,
  createProgressiveChartDensityIndex,
  type ChartDensityIndex,
  type ProgressiveChartDensityIndex,
} from "@moritzbrantner/charts";

import type { VizBackendOption, VizDataset, VizEngineBackend, VizResolvedBackend } from "./types";

export function createVizEngineBackend<TProperties = Record<string, unknown>>(
  option: VizBackendOption,
): VizEngineBackend<TProperties> {
  return {
    createIndex(dataset: VizDataset<TProperties>) {
      switch (option) {
        case "js":
          return createChartDensityIndex(dataset.points, { backend: "hybrid-js" });
        case "wasm":
          return createChartDensityIndex(dataset.points, { backend: "wasm-index" });
        case "auto":
          return createProgressiveChartDensityIndex(dataset.points);
      }
    },
    option,
    resolveBackend(index: ChartDensityIndex<TProperties>) {
      const progressive = index as Partial<ProgressiveChartDensityIndex<TProperties>>;
      const activeBackend =
        progressive.getActiveBackend?.() ?? index.getBackendCapabilities?.().backend;

      return activeBackend === "wasm-index" ? "wasm" : "js";
    },
  };
}

export function resolveFrameBackend<TProperties>(
  backend: VizEngineBackend<TProperties>,
  indexes: Array<ChartDensityIndex<TProperties>>,
): VizResolvedBackend {
  return indexes.some((index) => backend.resolveBackend(index) === "wasm") ? "wasm" : "js";
}
