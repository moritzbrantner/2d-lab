import { createVizEngineWithBackend } from "./create-viz-engine-core";
import { createVizEngineBackend } from "./js-backend";

import type { VizBackendConfig, VizBackendOption, VizCacheOptions, VizEngine } from "./types";

export type CreateVizEngineOptions = {
  backend?: VizBackendOption | VizBackendConfig;
  cache?: VizCacheOptions;
};

export function createVizEngine<TProperties = Record<string, unknown>>(
  options: CreateVizEngineOptions = {},
): VizEngine<TProperties> {
  return createVizEngineWithBackend(
    createVizEngineBackend<TProperties>(options.backend ?? "auto"),
    {
      cache: options.cache,
    },
  );
}
