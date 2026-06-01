import { createVizEngine } from "../../src/create-viz-engine";
import { JsVizDensityIndex } from "../../src/backend/js-density-index";
import { JsVizFinanceIndex } from "../../src/backend/js-finance-index";
import { JsVizGeoPointIndex } from "../../src/backend/js-geo-index";
import { RustWasmVizDensityIndex } from "../../src/backend/rust-wasm-density-index";
import { WasmVizFinanceIndex } from "../../src/backend/wasm-finance-index";
import { WasmVizGeoPointIndex } from "../../src/backend/wasm-geo-index";

import type {
  VizBackendOption,
  VizComputeFrameOptions,
  VizDataset,
  VizFinanceDataset,
  VizGeoPoint,
  VizLayer,
  VizSeriesPoint,
} from "../../src/types";

export {
  createVizEngine,
  JsVizDensityIndex,
  JsVizFinanceIndex,
  JsVizGeoPointIndex,
  RustWasmVizDensityIndex,
  WasmVizFinanceIndex,
  WasmVizGeoPointIndex,
};

export function createDensityIndex(
  implementation: "js" | "wasm",
  points: readonly VizSeriesPoint[],
) {
  return implementation === "js"
    ? new JsVizDensityIndex(points)
    : new RustWasmVizDensityIndex(points);
}

export function createGeoPointIndex(implementation: "js" | "wasm", points: readonly VizGeoPoint[]) {
  return implementation === "js"
    ? new JsVizGeoPointIndex(points)
    : new WasmVizGeoPointIndex(points);
}

export function createFinanceIndex(implementation: "js" | "wasm", dataset: VizFinanceDataset) {
  return implementation === "js"
    ? new JsVizFinanceIndex(dataset)
    : new WasmVizFinanceIndex(dataset);
}

export function createPreparedFrame(options: {
  backend: VizBackendOption;
  dataset: VizDataset;
  frameOptions: VizComputeFrameOptions;
  layers: VizLayer[];
}) {
  const engine = createVizEngine({ backend: options.backend });
  const datasetId = engine.addDataset(options.dataset);

  for (const layer of options.layers) {
    engine.addLayer({ ...layer, datasetId });
  }

  return {
    compute() {
      return engine.computeFrame(options.frameOptions);
    },
    datasetId,
    engine,
  };
}
