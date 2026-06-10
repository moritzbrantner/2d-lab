export type VizWasmLoadState = "idle" | "loading" | "ready" | "failed";

export type VizWasmModule = {
  FinanceDataSeriesIndex: new (...args: unknown[]) => unknown;
  GeoFlowIndex: new (...args: unknown[]) => unknown;
  GeoJsonIndex: new (...args: unknown[]) => unknown;
  GeoPointIndex: new (...args: unknown[]) => unknown;
  ScalarFieldIndex: new (...args: unknown[]) => unknown;
  VizEngineWasmDensityIndex: (new (...args: unknown[]) => unknown) & {
    fromArrays?: (...args: unknown[]) => unknown;
  };
  VizEngineWasmTableIndex: new (...args: unknown[]) => unknown;
  initVizEngineWasm(): WebAssembly.Exports | Promise<WebAssembly.Exports>;
};

export type VizWasmLoader = {
  getError(): unknown;
  getState(): VizWasmLoadState;
  load(): Promise<VizWasmModule>;
  preload(): Promise<void>;
};
