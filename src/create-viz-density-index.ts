import { JsVizDensityIndex } from "./backend/js-density-index";
import { ProgressiveVizDensityIndex } from "./backend/progressive-density-index";
import { RustWasmVizDensityIndex } from "./backend/rust-wasm-density-index";

import type { VizBackendOption, VizDensityIndex, VizSeriesPoint } from "./types";

export type CreateVizDensityIndexOptions = {
  backend?: Exclude<VizBackendOption, "mixed">;
};

export function createVizDensityIndex<TProperties = Record<string, unknown>>(
  points: readonly VizSeriesPoint<TProperties>[],
  options: CreateVizDensityIndexOptions = {},
): VizDensityIndex<TProperties> {
  switch (options.backend ?? "auto") {
    case "js":
      return new JsVizDensityIndex(points);
    case "wasm":
      return new RustWasmVizDensityIndex(points);
    case "auto":
      return new ProgressiveVizDensityIndex(points);
  }
}
