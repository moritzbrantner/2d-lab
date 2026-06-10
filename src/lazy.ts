import {
  createLazyVizEngineBackend,
  type CreateLazyVizEngineBackendOptions,
} from "./backend/create-backend-lazy";
import { createVizEngineWithBackend } from "./create-viz-engine-core";
import { VizWasmUnavailableError } from "./errors";
import { createVizWasmLoader, preloadVizEngineWasm } from "./wasm/lazy-bindings";

import type { CreateVizEngineOptions } from "./create-viz-engine";
import type { VizEngine } from "./types";
import type { VizWasmLoader } from "./wasm/types";

export type CreateAsyncVizEngineOptions = CreateVizEngineOptions & {
  wasm?: {
    fallback?: "error" | "js";
    loader?: VizWasmLoader;
    loadPolicy?: "never" | "on-demand" | "preload";
  };
};

export {
  createLazyVizEngineBackend,
  createVizWasmLoader,
  preloadVizEngineWasm,
  VizWasmUnavailableError,
};
export { loadVizEngineWasmModule as initVizEngineWasm } from "./wasm/lazy-bindings";
export type { VizWasmLoader, VizWasmLoadState, VizWasmModule } from "./wasm/types";

export async function createAsyncVizEngine<TProperties = Record<string, unknown>>(
  options: CreateAsyncVizEngineOptions = {},
): Promise<VizEngine<TProperties>> {
  const loader = options.wasm?.loader ?? createVizWasmLoader();
  const loadPolicy = options.wasm?.loadPolicy ?? "on-demand";
  const fallback = options.wasm?.fallback ?? "js";
  let wasmModule: Awaited<ReturnType<VizWasmLoader["load"]>> | null = null;

  if (loadPolicy === "preload") {
    try {
      wasmModule = await loader.load();
    } catch (error) {
      if (fallback === "error") {
        throw new VizWasmUnavailableError("Viz Engine WASM preload failed.", { cause: error });
      }
    }
  }

  const backendOptions: CreateLazyVizEngineBackendOptions = {
    fallback,
    loader,
    loadPolicy,
    option: options.backend ?? "auto",
    wasmModule,
  };

  return createVizEngineWithBackend(createLazyVizEngineBackend<TProperties>(backendOptions), {
    cache: options.cache,
  });
}
