import { describe, expect, test } from "vitest";

import { JsVizFinanceIndex } from "./js-finance-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";

import type { VizFinanceDataset } from "../types";

const dataset: VizFinanceDataset = {
  bars: [
    { close: 100, high: 101, low: 98, open: 99, timestamp: 1, volume: 10 },
    { close: 110, high: 112, low: 99, open: 100, timestamp: 2, volume: 20 },
    { close: 105, high: 111, low: 104, open: 110, timestamp: 3, volume: 30 },
  ],
  instrument: { symbol: "AAPL" },
  kind: "finance-ohlcv",
};

describe("WasmVizFinanceIndex", () => {
  test("matches JS finance index output and reports Rust-backed capabilities", () => {
    const jsIndex = new JsVizFinanceIndex(dataset);
    const wasmIndex = new WasmVizFinanceIndex(dataset);

    expect(wasmIndex.getBackendCapabilities()).toEqual({
      backend: "wasm",
      implementation: "rust-finance-data-wasm",
      usesWasm: true,
    });
    expect(wasmIndex.getBounds()).toEqual(jsIndex.getBounds());
    expect(wasmIndex.getDownsampledBars({ targetBarCount: 2, xDomain: [1, 3] })).toEqual(
      jsIndex.getDownsampledBars({ targetBarCount: 2, xDomain: [1, 3] }),
    );
    expect(wasmIndex.getReturns({ xDomain: [1, 3] }).samples).toEqual(
      jsIndex.getReturns({ xDomain: [1, 3] }).samples,
    );
  });
});
