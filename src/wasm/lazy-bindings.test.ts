import { describe, expect, test } from "vitest";

import { createVizWasmLoader } from "./lazy-bindings";

import type { VizWasmModule } from "./types";

describe("createVizWasmLoader", () => {
  test("starts idle and shares repeated loads", async () => {
    let loadCount = 0;
    const module = createMockWasmModule();
    const loader = createVizWasmLoader(async () => {
      loadCount += 1;
      return module;
    });

    expect(loader.getState()).toBe("idle");

    const first = loader.load();
    const second = loader.load();

    expect(first).toBe(second);
    expect(await first).toBe(module);
    expect(loader.getState()).toBe("ready");
    expect(loadCount).toBe(1);
  });

  test("preload transitions to ready", async () => {
    const loader = createVizWasmLoader(async () => createMockWasmModule());

    await loader.preload();

    expect(loader.getState()).toBe("ready");
    expect(loader.getError()).toBeUndefined();
  });

  test("failed load records the error", async () => {
    const error = new Error("load failed");
    const loader = createVizWasmLoader(async () => {
      throw error;
    });

    await expect(loader.load()).rejects.toBe(error);

    expect(loader.getState()).toBe("failed");
    expect(loader.getError()).toBe(error);
  });
});

function createMockWasmModule(): VizWasmModule {
  const Constructor = class {};
  return {
    FinanceDataSeriesIndex: Constructor,
    GeoFlowIndex: Constructor,
    GeoJsonIndex: Constructor,
    GeoPointIndex: Constructor,
    initVizEngineWasm: () => ({}) as WebAssembly.Exports,
    ScalarFieldIndex: Constructor,
    VizEngineWasmDensityIndex: Constructor,
    VizEngineWasmTableIndex: Constructor,
  };
}
