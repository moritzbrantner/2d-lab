import { describe, expect, test } from "vitest";

import {
  createVizEngineBackend,
  resolveFrameBackend,
  resolveFrameBackendImplementation,
} from "./create-backend";
import { JsVizDensityIndex } from "./js-density-index";
import { JsVizFinanceIndex } from "./js-finance-index";
import { JsVizGeoFlowIndex } from "./js-geo-flow-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { JsVizGeoJsonIndex } from "./js-geojson-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";

import type { VizDatasetIndex } from "../types";

describe("createVizEngineBackend", () => {
  test("creates density indexes for each backend option", () => {
    const dataset = { kind: "xy" as const, points: [{ x: 0, y: 1 }] };

    expect(createVizEngineBackend("js").createIndex(dataset)).toMatchObject({
      index: expect.any(JsVizDensityIndex),
      kind: "xy",
    });
    expect(createVizEngineBackend("wasm").createIndex(dataset)).toMatchObject({
      index: expect.any(RustWasmVizDensityIndex),
      kind: "xy",
    });
    expect(createVizEngineBackend("auto").createIndex(dataset)).toMatchObject({
      index: expect.any(ProgressiveVizDensityIndex),
      kind: "xy",
    });
  });

  test("creates geo point indexes for each backend option", () => {
    const dataset = { kind: "geo-points" as const, points: [{ latitude: 52, longitude: 13 }] };

    expect(createVizEngineBackend("js").createIndex(dataset)).toMatchObject({
      index: expect.any(JsVizGeoPointIndex),
      kind: "geo-points",
    });
    expect(createVizEngineBackend("wasm").createIndex(dataset)).toMatchObject({
      index: expect.any(WasmVizGeoPointIndex),
      kind: "geo-points",
    });
    expect(createVizEngineBackend("auto").createIndex(dataset)).toMatchObject({
      index: expect.any(WasmVizGeoPointIndex),
      kind: "geo-points",
    });
  });

  test("creates indexes for geojson and geo-flows", () => {
    const backend = createVizEngineBackend("js");

    expect(
      backend.createIndex({
        featureCollection: { features: [], type: "FeatureCollection" },
        kind: "geojson",
      }),
    ).toMatchObject({ index: expect.any(JsVizGeoJsonIndex), kind: "geojson" });
    expect(backend.createIndex({ flows: [], kind: "geo-flows" })).toMatchObject({
      index: expect.any(JsVizGeoFlowIndex),
      kind: "geo-flows",
    });
  });

  test("creates finance indexes for each backend option", () => {
    const dataset = {
      bars: [{ close: 101, high: 102, low: 99, open: 100, timestamp: 1, volume: 10 }],
      instrument: { symbol: "AAPL" },
      kind: "finance-ohlcv" as const,
    };

    expect(createVizEngineBackend("js").createIndex(dataset)).toMatchObject({
      index: expect.any(JsVizFinanceIndex),
      kind: "finance-ohlcv",
    });
    expect(createVizEngineBackend("wasm").createIndex(dataset)).toMatchObject({
      index: expect.any(WasmVizFinanceIndex),
      kind: "finance-ohlcv",
    });
    expect(createVizEngineBackend("auto").createIndex(dataset)).toMatchObject({
      index: expect.any(WasmVizFinanceIndex),
      kind: "finance-ohlcv",
    });
  });

  test("resolves frame backend and implementation stats", () => {
    const backend = createVizEngineBackend("js");
    const jsIndex = createVizEngineBackend("js").createIndex({
      kind: "xy",
      points: [{ x: 0, y: 1 }],
    });
    const wasmIndex = createVizEngineBackend("wasm").createIndex({
      kind: "xy",
      points: [{ x: 0, y: 1 }],
    });
    const legacyWasmIndex = createVizEngineBackend("wasm").createIndex({
      kind: "geo-points",
      points: [{ latitude: 52, longitude: 13 }],
    });
    const geojsonIndex: VizDatasetIndex = createVizEngineBackend("js").createIndex({
      featureCollection: { features: [], type: "FeatureCollection" },
      kind: "geojson",
    });

    expect(resolveFrameBackend(backend, [jsIndex])).toBe("js");
    expect(resolveFrameBackend(createVizEngineBackend("wasm"), [wasmIndex])).toBe("wasm");
    expect(resolveFrameBackend(createVizEngineBackend("wasm"), [jsIndex, wasmIndex])).toBe("mixed");
    expect(resolveFrameBackendImplementation([])).toBe("js");
    expect(resolveFrameBackendImplementation([jsIndex])).toBe("js");
    expect(resolveFrameBackendImplementation([wasmIndex])).toBe("rust-viz-engine-wasm");
    expect(resolveFrameBackendImplementation([legacyWasmIndex])).toBe("legacy-wasm");
    expect(
      resolveFrameBackendImplementation([
        createVizEngineBackend("wasm").createIndex({
          bars: [{ close: 101, high: 102, low: 99, open: 100, timestamp: 1 }],
          instrument: { symbol: "AAPL" },
          kind: "finance-ohlcv",
        }),
      ]),
    ).toBe("rust-finance-data-wasm");
    expect(resolveFrameBackendImplementation([wasmIndex, legacyWasmIndex, geojsonIndex])).toBe(
      "mixed",
    );
  });
});
