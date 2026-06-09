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
import { JsVizTableIndex } from "./js-table-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { RustWasmVizTableIndex } from "./rust-wasm-table-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";

import type { VizDatasetIndex } from "../types";

describe("createVizEngineBackend", () => {
  const objectTableDataset = {
    columns: [{ id: "score", type: "number" as const }],
    kind: "table" as const,
    rows: [{ id: "a", score: 1 }],
  };

  const numericColumnarTableDataset = (rowCount: number) => ({
    columns: [{ id: "score", type: "number" as const, values: new Float64Array(rowCount) }],
    kind: "table" as const,
    rowIds: Array.from({ length: rowCount }, (_, index) => String(index)),
  });

  const stringColumnarTableDataset = (rowCount: number) => ({
    columns: [
      {
        id: "name",
        type: "string" as const,
        values: Array.from({ length: rowCount }, () => "core"),
      },
    ],
    kind: "table" as const,
  });

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
      index: expect.any(JsVizGeoPointIndex),
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
      index: expect.any(JsVizFinanceIndex),
      kind: "finance-ohlcv",
    });
  });

  test("creates JS table index when JS is requested for object rows", () => {
    expect(createVizEngineBackend("js").createIndex(objectTableDataset)).toMatchObject({
      index: expect.any(JsVizTableIndex),
      kind: "table",
    });
  });

  test("falls back to JS for object-row tables when WASM is requested", () => {
    expect(createVizEngineBackend("wasm").createIndex(objectTableDataset)).toMatchObject({
      index: expect.any(JsVizTableIndex),
      kind: "table",
    });
  });

  test("falls back to JS for empty columnar tables when WASM is requested", () => {
    expect(
      createVizEngineBackend("wasm").createIndex({
        columns: [],
        kind: "table",
        rowIds: [],
      }),
    ).toMatchObject({
      index: expect.any(JsVizTableIndex),
      kind: "table",
    });
  });

  test("creates WASM table index for string-only columnar tables when WASM is requested", () => {
    expect(createVizEngineBackend("wasm").createIndex(stringColumnarTableDataset(1))).toMatchObject(
      {
        index: expect.any(RustWasmVizTableIndex),
        kind: "table",
      },
    );
  });

  test("creates WASM table index for numeric columnar tables when WASM is requested", () => {
    expect(
      createVizEngineBackend("wasm").createIndex(numericColumnarTableDataset(1)),
    ).toMatchObject({
      index: expect.any(RustWasmVizTableIndex),
      kind: "table",
    });
  });

  test("uses JS table index for auto numeric columnar tables below threshold", () => {
    expect(
      createVizEngineBackend("auto").createIndex(numericColumnarTableDataset(9_999)),
    ).toMatchObject({
      index: expect.any(JsVizTableIndex),
      kind: "table",
    });
  });

  test("uses WASM table index for auto numeric columnar tables at threshold", () => {
    expect(
      createVizEngineBackend("auto").createIndex(numericColumnarTableDataset(10_000)),
    ).toMatchObject({
      index: expect.any(RustWasmVizTableIndex),
      kind: "table",
    });
  });

  test("keeps string-only columnar tables JS-owned for auto backend", () => {
    expect(
      createVizEngineBackend("auto").createIndex(stringColumnarTableDataset(10_000)),
    ).toMatchObject({
      index: expect.any(JsVizTableIndex),
      kind: "table",
    });
  });

  test("scoped table WASM option affects table indexes only", () => {
    const backend = createVizEngineBackend({ table: "wasm", xy: "js" });

    expect(backend.createIndex(numericColumnarTableDataset(1))).toMatchObject({
      index: expect.any(RustWasmVizTableIndex),
      kind: "table",
    });
    expect(backend.createIndex({ kind: "xy", points: [{ x: 0, y: 1 }] })).toMatchObject({
      index: expect.any(JsVizDensityIndex),
      kind: "xy",
    });
  });

  test("scoped table JS option keeps table JS while XY uses WASM", () => {
    const backend = createVizEngineBackend({ table: "js", xy: "wasm" });

    expect(backend.createIndex(numericColumnarTableDataset(1))).toMatchObject({
      index: expect.any(JsVizTableIndex),
      kind: "table",
    });
    expect(backend.createIndex({ kind: "xy", points: [{ x: 0, y: 1 }] })).toMatchObject({
      index: expect.any(RustWasmVizDensityIndex),
      kind: "xy",
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
    const wasmGeoIndex = createVizEngineBackend("wasm").createIndex({
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
    expect(resolveFrameBackendImplementation([wasmGeoIndex])).toBe("rust-geo-viz-wasm");
    expect(
      resolveFrameBackendImplementation([
        createVizEngineBackend("wasm").createIndex({
          bars: [{ close: 101, high: 102, low: 99, open: 100, timestamp: 1 }],
          instrument: { symbol: "AAPL" },
          kind: "finance-ohlcv",
        }),
      ]),
    ).toBe("rust-finance-data-wasm");
    expect(resolveFrameBackendImplementation([wasmIndex, wasmGeoIndex, geojsonIndex])).toBe(
      "mixed",
    );
  });
});
