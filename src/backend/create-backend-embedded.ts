import { ProgressiveVizDensityIndex } from "./progressive-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { RustWasmVizTableIndex } from "./rust-wasm-table-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";
import { JsVizDensityIndex } from "./js-density-index";
import {
  canUseWasmTableIndex,
  createJsDatasetIndex,
  createJsTableIndex,
  normalizeBackendConfig,
  resolveFrameBackend,
  resolveFrameBackendImplementation,
  shouldAutoUseWasmTableIndex,
  withBackendMetadata,
} from "./create-backend-shared";
import { createBackendDiagnostic } from "../diagnostics";
import { embeddedVizWasmModule } from "../wasm/embedded-module";

import type {
  VizBackendConfig,
  VizBackendOption,
  VizDataset,
  VizDatasetIndex,
  VizEngineBackend,
  VizTableDataset,
  VizTableIndex,
} from "../types";

export function createVizEngineBackend<TProperties = Record<string, unknown>>(
  option: VizBackendOption | VizBackendConfig,
): VizEngineBackend<TProperties> {
  const config = normalizeBackendConfig(option);

  return {
    createIndex(dataset: VizDataset<TProperties>) {
      return createEmbeddedDatasetIndex(dataset, config);
    },
    option: config,
    resolveBackend(index: VizDatasetIndex<TProperties>): "js" | "wasm" {
      return index.index.getBackendCapabilities().backend;
    },
  };
}

function createEmbeddedDatasetIndex<TProperties>(
  dataset: VizDataset<TProperties>,
  config: Required<VizBackendConfig>,
): VizDatasetIndex<TProperties> {
  switch (dataset.kind) {
    case "geo-points":
      return config.geo === "wasm"
        ? withBackendMetadata(
            {
              index: new WasmVizGeoPointIndex(dataset.points, embeddedVizWasmModule),
              kind: "geo-points",
            },
            { requested: config.geo, selected: "wasm" },
          )
        : createJsDatasetIndex(dataset, { requestedBackend: config.geo });
    case "geojson":
      return config.geo === "wasm"
        ? withBackendMetadata(
            {
              index: new WasmVizGeoJsonIndex(dataset.featureCollection, embeddedVizWasmModule),
              kind: "geojson",
            },
            { requested: config.geo, selected: "wasm" },
          )
        : createJsDatasetIndex(dataset, { requestedBackend: config.geo });
    case "geo-flows":
      return config.geo === "wasm"
        ? withBackendMetadata(
            {
              index: new WasmVizGeoFlowIndex(dataset.flows, embeddedVizWasmModule),
              kind: "geo-flows",
            },
            { requested: config.geo, selected: "wasm" },
          )
        : createJsDatasetIndex(dataset, { requestedBackend: config.geo });
    case "finance-ohlcv":
      return config.finance === "wasm"
        ? withBackendMetadata(
            {
              index: new WasmVizFinanceIndex(dataset, embeddedVizWasmModule),
              kind: "finance-ohlcv",
            },
            { requested: config.finance, selected: "wasm" },
          )
        : createJsDatasetIndex(dataset, { requestedBackend: config.finance });
    case "xy":
      return withBackendMetadata(
        {
          index:
            config.xy === "js"
              ? new JsVizDensityIndex(dataset)
              : config.xy === "wasm"
                ? new RustWasmVizDensityIndex(dataset, embeddedVizWasmModule)
                : new ProgressiveVizDensityIndex(
                    dataset,
                    (points) => new RustWasmVizDensityIndex(points, embeddedVizWasmModule),
                  ),
          kind: "xy",
        },
        { requested: config.xy },
      );
    case "table":
      return createEmbeddedTableDatasetIndex(dataset, config.table);
  }
}

function createEmbeddedTableDatasetIndex<TRow>(
  dataset: VizTableDataset<TRow>,
  option: VizBackendOption,
): VizDatasetIndex<TRow> {
  if (option === "js") {
    return withBackendMetadata(
      { index: createJsTableIndex(dataset), kind: "table" },
      { requested: option },
    );
  }

  if (!canUseWasmTableIndex(dataset)) {
    const fallbackReason = option === "wasm" ? "wasm-unsupported-dataset-js-fallback" : undefined;
    const diagnostics = fallbackReason
      ? [
          createBackendDiagnostic({
            code: fallbackReason,
            implementation: "js",
            message: "Table dataset is not supported by the WASM backend; using JavaScript.",
            requested: option,
            selected: "js",
            details: { reason: "unsupported-table-dataset" },
          }),
        ]
      : undefined;
    return withBackendMetadata(
      { index: createJsTableIndex(dataset), kind: "table" },
      {
        requested: option,
        fallbackReason,
        diagnostics,
        details: fallbackReason ? { reason: "unsupported-table-dataset" } : undefined,
      },
    );
  }

  if (option === "wasm") {
    return withBackendMetadata(
      { index: new RustWasmVizTableIndex(dataset, embeddedVizWasmModule), kind: "table" },
      { requested: option, selected: "wasm" },
    );
  }

  if (option === "auto" && shouldAutoUseWasmTableIndex(dataset)) {
    return withBackendMetadata(
      { index: new RustWasmVizTableIndex(dataset, embeddedVizWasmModule), kind: "table" },
      { requested: option, selected: "wasm" },
    );
  }

  return withBackendMetadata(
    { index: createJsTableIndex(dataset), kind: "table" },
    { requested: option },
  );
}

export { resolveFrameBackend, resolveFrameBackendImplementation };
