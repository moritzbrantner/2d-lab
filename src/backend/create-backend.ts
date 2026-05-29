import { JsVizDensityIndex } from "./js-density-index";
import { JsVizGeoFlowIndex } from "./js-geo-flow-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { JsVizGeoJsonIndex } from "./js-geojson-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";

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
        switch (option) {
          case "js":
            return {
              index: new JsVizGeoJsonIndex(dataset.featureCollection),
              kind: "geojson",
            };
          case "wasm":
          case "auto":
            return {
              index: new WasmVizGeoJsonIndex(dataset.featureCollection),
              kind: "geojson",
            };
        }
      }

      if (dataset.kind === "geo-flows") {
        switch (option) {
          case "js":
            return {
              index: new JsVizGeoFlowIndex(dataset.flows),
              kind: "geo-flows",
            };
          case "wasm":
          case "auto":
            return {
              index: new WasmVizGeoFlowIndex(dataset.flows),
              kind: "geo-flows",
            };
        }
      }

      switch (option) {
        case "js":
          return {
            index: new JsVizDensityIndex(dataset.points),
            kind: "xy",
          };
        case "wasm":
          return {
            index: new RustWasmVizDensityIndex(dataset.points),
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
      if (
        index.kind === "xy" ||
        index.kind === "geo-points" ||
        index.kind === "geojson" ||
        index.kind === "geo-flows"
      ) {
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

export function resolveFrameBackendImplementation<TProperties>(
  indexes: Array<VizDatasetIndex<TProperties>>,
) {
  const implementations = new Set(
    indexes.map((index) => {
      if (
        index.kind === "xy" ||
        index.kind === "geo-points" ||
        index.kind === "geojson" ||
        index.kind === "geo-flows"
      ) {
        const capabilities = index.index.getBackendCapabilities();

        return (
          capabilities.implementation ?? (capabilities.backend === "js" ? "js" : "legacy-wasm")
        );
      }

      return "js";
    }),
  );

  if (implementations.size > 1) {
    return "mixed" as const;
  }

  return implementations.values().next().value ?? ("js" as const);
}
