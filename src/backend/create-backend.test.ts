import { describe, expect, test } from "vitest";

import {
  createVizEngineBackend,
  resolveFrameBackend,
  resolveFrameBackendImplementation,
} from "./create-backend";
import { JsVizDensityIndex } from "./js-density-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";

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

  test("creates marker indexes for geojson and geo-flows", () => {
    const backend = createVizEngineBackend("js");

    expect(
      backend.createIndex({
        featureCollection: { features: [], type: "FeatureCollection" },
        kind: "geojson",
      }),
    ).toEqual({ kind: "geojson" });
    expect(backend.createIndex({ flows: [], kind: "geo-flows" })).toEqual({ kind: "geo-flows" });
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
    const geojsonIndex: VizDatasetIndex = { kind: "geojson" };

    expect(resolveFrameBackend(backend, [jsIndex])).toBe("js");
    expect(resolveFrameBackend(createVizEngineBackend("wasm"), [wasmIndex])).toBe("wasm");
    expect(resolveFrameBackend(createVizEngineBackend("wasm"), [jsIndex, wasmIndex])).toBe("mixed");
    expect(resolveFrameBackendImplementation([])).toBe("js");
    expect(resolveFrameBackendImplementation([jsIndex])).toBe("js");
    expect(resolveFrameBackendImplementation([wasmIndex])).toBe("rust-viz-engine-wasm");
    expect(resolveFrameBackendImplementation([legacyWasmIndex])).toBe("legacy-wasm");
    expect(resolveFrameBackendImplementation([wasmIndex, legacyWasmIndex, geojsonIndex])).toBe(
      "mixed",
    );
  });
});
