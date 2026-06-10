import type { VizWasmLoadState, VizWasmLoader, VizWasmModule } from "./types";

let modulePromise: Promise<VizWasmModule> | null = null;
let loadState: VizWasmLoadState = "idle";
let loadError: unknown;

export function loadVizEngineWasmModule(): Promise<VizWasmModule> {
  if (!modulePromise) {
    loadState = "loading";
    loadError = undefined;
    modulePromise = import(resolveVizEngineWasmModuleUrl())
      .then(async (module) => {
        const maybeInit = (module as unknown as { default?: () => Promise<unknown> | unknown })
          .default;
        if (maybeInit) {
          await maybeInit();
        }
        loadState = "ready";
        return module as unknown as VizWasmModule;
      })
      .catch((error: unknown) => {
        loadState = "failed";
        loadError = error;
        modulePromise = null;
        throw error;
      });
  }

  return modulePromise;
}

function resolveVizEngineWasmModuleUrl() {
  const relativePath = import.meta.url.includes("/dist/")
    ? "./pkg/moritzbrantner_viz_engine_wasm.js"
    : "./pkg/moritzbrantner_viz_engine_wasm.js";

  return new URL(relativePath, import.meta.url).href;
}

export function preloadVizEngineWasm(): Promise<void> {
  return loadVizEngineWasmModule().then(() => undefined);
}

export function getVizEngineWasmLoadState(): VizWasmLoadState {
  return loadState;
}

export function getVizEngineWasmLoadError(): unknown {
  return loadError;
}

export function createVizWasmLoader(
  loadModule: () => Promise<VizWasmModule> = loadVizEngineWasmModule,
): VizWasmLoader {
  let state: VizWasmLoadState = "idle";
  let error: unknown;
  let promise: Promise<VizWasmModule> | null = null;

  function load() {
    if (!promise) {
      state = "loading";
      error = undefined;
      promise = loadModule()
        .then((module) => {
          state = "ready";
          return module;
        })
        .catch((loadErrorValue: unknown) => {
          state = "failed";
          error = loadErrorValue;
          promise = null;
          throw loadErrorValue;
        });
    }

    return promise;
  }

  return {
    getError() {
      return error;
    },
    getState() {
      return state;
    },
    load,
    preload() {
      return load().then(() => undefined);
    },
  };
}
