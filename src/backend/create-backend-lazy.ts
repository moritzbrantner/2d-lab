import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { RustWasmVizTableIndex } from "./rust-wasm-table-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";
import { createBackendDiagnostic } from "../diagnostics";
import { VizWasmUnavailableError } from "../errors";
import {
  canUseWasmTableIndex,
  createJsDatasetIndex,
  createJsTableIndex,
  normalizeBackendConfig,
  withBackendMetadata,
} from "./create-backend-shared";

import type {
  VizBackendConfig,
  VizBackendOption,
  VizDataset,
  VizDatasetIndex,
  VizDiagnosticCode,
  VizEngineBackend,
  VizFrameDiagnostic,
  VizTableDataset,
} from "../types";
import type { VizWasmLoader, VizWasmModule } from "../wasm/types";

export type LazyVizBackendFallback = "error" | "js";
export type LazyVizBackendLoadPolicy = "never" | "on-demand" | "preload";

export type CreateLazyVizEngineBackendOptions = {
  fallback?: LazyVizBackendFallback;
  loader: VizWasmLoader;
  loadPolicy?: LazyVizBackendLoadPolicy;
  option: VizBackendOption | VizBackendConfig;
  wasmModule?: VizWasmModule | null;
};

export function createLazyVizEngineBackend<TProperties = Record<string, unknown>>(
  options: CreateLazyVizEngineBackendOptions,
): VizEngineBackend<TProperties> {
  const config =
    options.loadPolicy === "never"
      ? normalizeBackendConfig("js")
      : normalizeBackendConfig(options.option);
  const fallback = options.fallback ?? "js";
  let wasmModule = options.wasmModule ?? null;

  if (options.loadPolicy === "on-demand" && options.loader.getState() === "idle") {
    options.loader
      .load()
      .then((module) => {
        wasmModule = module;
      })
      .catch(() => undefined);
  }

  return {
    createIndex(dataset: VizDataset<TProperties>) {
      return createLazyDatasetIndex(dataset, {
        config,
        fallback,
        loader: options.loader,
        wasmModule,
      });
    },
    option: config,
    resolveBackend(index: VizDatasetIndex<TProperties>): "js" | "wasm" {
      return index.index.getBackendCapabilities().backend;
    },
  };
}

function createLazyDatasetIndex<TProperties>(
  dataset: VizDataset<TProperties>,
  context: {
    config: Required<VizBackendConfig>;
    fallback: LazyVizBackendFallback;
    loader: VizWasmLoader;
    wasmModule: VizWasmModule | null;
  },
): VizDatasetIndex<TProperties> {
  switch (dataset.kind) {
    case "geo-points":
      return context.config.geo === "js"
        ? createJsDatasetIndex(dataset, { requestedBackend: context.config.geo })
        : createWasmOrFallback(
            dataset,
            context,
            () => ({
              index: new WasmVizGeoPointIndex(dataset.points, context.wasmModule!),
              kind: "geo-points",
            }),
            context.config.geo,
          );
    case "geojson":
      return context.config.geo === "js"
        ? createJsDatasetIndex(dataset, { requestedBackend: context.config.geo })
        : createWasmOrFallback(
            dataset,
            context,
            () => ({
              index: new WasmVizGeoJsonIndex(dataset.featureCollection, context.wasmModule!),
              kind: "geojson",
            }),
            context.config.geo,
          );
    case "geo-flows":
      return context.config.geo === "js"
        ? createJsDatasetIndex(dataset, { requestedBackend: context.config.geo })
        : createWasmOrFallback(
            dataset,
            context,
            () => ({
              index: new WasmVizGeoFlowIndex(dataset.flows, context.wasmModule!),
              kind: "geo-flows",
            }),
            context.config.geo,
          );
    case "finance-ohlcv":
      return context.config.finance === "js"
        ? createJsDatasetIndex(dataset, { requestedBackend: context.config.finance })
        : createWasmOrFallback(
            dataset,
            context,
            () => ({
              index: new WasmVizFinanceIndex(dataset, context.wasmModule!),
              kind: "finance-ohlcv",
            }),
            context.config.finance,
          );
    case "xy":
      return context.config.xy === "js"
        ? createJsDatasetIndex(dataset, { requestedBackend: context.config.xy })
        : createWasmOrFallback(
            dataset,
            context,
            () => ({
              index: new RustWasmVizDensityIndex(dataset, context.wasmModule!),
              kind: "xy",
            }),
            context.config.xy,
          );
    case "table":
      return createLazyTableDatasetIndex(dataset, context);
  }
}

function createLazyTableDatasetIndex<TRow>(
  dataset: VizTableDataset<TRow>,
  context: {
    config: Required<VizBackendConfig>;
    fallback: LazyVizBackendFallback;
    loader: VizWasmLoader;
    wasmModule: VizWasmModule | null;
  },
): VizDatasetIndex<TRow> {
  if (context.config.table === "js") {
    return withBackendMetadata(
      { index: createJsTableIndex(dataset), kind: "table" },
      { requested: context.config.table },
    );
  }

  if (!canUseWasmTableIndex(dataset)) {
    const fallbackReason =
      context.config.table === "wasm" ? "wasm-unsupported-dataset-js-fallback" : undefined;
    return withBackendMetadata(
      { index: createJsTableIndex(dataset), kind: "table" },
      {
        requested: context.config.table,
        fallbackReason,
        diagnostics: fallbackReason
          ? [
              createBackendDiagnostic({
                code: fallbackReason,
                details: { reason: "unsupported-table-dataset" },
                implementation: "js",
                message: "Table dataset is not supported by the WASM backend; using JavaScript.",
                requested: context.config.table,
                selected: "js",
              }),
            ]
          : undefined,
        details: fallbackReason ? { reason: "unsupported-table-dataset" } : undefined,
      },
    );
  }

  const fallback = getLazyFallback(context);
  if (!fallback && context.wasmModule) {
    return withBackendMetadata(
      { index: new RustWasmVizTableIndex(dataset, context.wasmModule), kind: "table" },
      { requested: context.config.table, selected: "wasm" },
    );
  }

  if (context.fallback === "error") {
    throw createUnavailableError(context);
  }

  return withBackendMetadata(
    { index: createJsTableIndex(dataset), kind: "table" },
    {
      requested: context.config.table,
      fallbackReason: fallback?.code,
      diagnostics: fallback?.diagnostics,
      details: fallback?.details,
    },
  );
}

function createWasmOrFallback<TProperties>(
  dataset: VizDataset<TProperties>,
  context: {
    fallback: LazyVizBackendFallback;
    loader: VizWasmLoader;
    wasmModule: VizWasmModule | null;
  },
  createWasmIndex: () => VizDatasetIndex<TProperties>,
  requested: VizBackendOption,
): VizDatasetIndex<TProperties> {
  const fallback = getLazyFallback(context);
  if (!fallback && context.wasmModule) {
    return withBackendMetadata(createWasmIndex(), { requested, selected: "wasm" });
  }

  if (context.fallback === "error") {
    throw createUnavailableError(context);
  }

  return createJsDatasetIndex(dataset, {
    details: fallback?.details,
    diagnostics: fallback?.diagnostics,
    fallbackReason: fallback?.code,
    requestedBackend: requested,
  });
}

function getLazyFallback(context: { loader: VizWasmLoader; wasmModule: VizWasmModule | null }):
  | {
      code: VizDiagnosticCode;
      details: Record<string, unknown>;
      diagnostics: VizFrameDiagnostic[];
    }
  | undefined {
  if (context.wasmModule) {
    return undefined;
  }

  const state = context.loader.getState();
  if (state === "failed") {
    const code = "wasm-load-failed-js-fallback";
    const details = { state };
    return {
      code,
      details,
      diagnostics: [
        createBackendDiagnostic({
          code,
          details,
          implementation: "js",
          message: "WASM failed to load; using the JavaScript backend.",
          selected: "js",
        }),
      ],
    };
  }

  if (state === "idle" || state === "loading") {
    const code = "wasm-loading-js-fallback";
    const details = { state };
    return {
      code,
      details,
      diagnostics: [
        createBackendDiagnostic({
          code,
          details,
          implementation: "js",
          message: "WASM is not ready yet; using the JavaScript backend.",
          selected: "js",
        }),
      ],
    };
  }

  return undefined;
}

function createUnavailableError(context: { loader: VizWasmLoader }) {
  return new VizWasmUnavailableError("Viz Engine WASM is not available.", {
    cause: context.loader.getError(),
  });
}
