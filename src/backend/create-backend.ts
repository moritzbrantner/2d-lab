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
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";

import type {
  VizBackendConfig,
  VizBackendOption,
  VizDataset,
  VizDatasetIndex,
  VizEngineBackend,
  VizTableColumnarDataset,
  VizTableDataset,
  VizTableIndex,
} from "../types";

export function createVizEngineBackend<TProperties = Record<string, unknown>>(
  option: VizBackendOption | VizBackendConfig,
): VizEngineBackend<TProperties> {
  const config = normalizeBackendConfig(option);

  return {
    createIndex(dataset: VizDataset<TProperties>) {
      return createDatasetIndex(dataset, config);
    },
    option: config,
    resolveBackend(index: VizDatasetIndex<TProperties>): "js" | "wasm" {
      return index.index.getBackendCapabilities().backend;
    },
  };
}

function createDatasetIndex<TProperties>(
  dataset: VizDataset<TProperties>,
  config: Required<VizBackendConfig>,
): VizDatasetIndex<TProperties> {
  switch (dataset.kind) {
    case "geo-points":
      return {
        index:
          config.geo === "wasm"
            ? new WasmVizGeoPointIndex(dataset.points)
            : new JsVizGeoPointIndex(dataset.points),
        kind: "geo-points",
      };
    case "geojson":
      return {
        index:
          config.geo === "wasm"
            ? new WasmVizGeoJsonIndex(dataset.featureCollection)
            : new JsVizGeoJsonIndex(dataset.featureCollection),
        kind: "geojson",
      };
    case "geo-flows":
      return {
        index:
          config.geo === "wasm"
            ? new WasmVizGeoFlowIndex(dataset.flows)
            : new JsVizGeoFlowIndex(dataset.flows),
        kind: "geo-flows",
      };
    case "finance-ohlcv":
      return {
        index:
          config.finance === "wasm"
            ? new WasmVizFinanceIndex(dataset)
            : new JsVizFinanceIndex(dataset),
        kind: "finance-ohlcv",
      };
    case "xy":
      return {
        index:
          config.xy === "js"
            ? new JsVizDensityIndex(dataset)
            : config.xy === "wasm"
              ? new RustWasmVizDensityIndex(dataset)
              : new ProgressiveVizDensityIndex(dataset),
        kind: "xy",
      };
    case "table":
      return {
        index: createTableIndex(dataset, config.table),
        kind: "table",
      };
  }
}

function createTableIndex<TRow>(
  dataset: VizTableDataset<TRow>,
  option: VizBackendOption,
): VizTableIndex {
  if (option === "js") {
    return new JsVizTableIndex(dataset);
  }

  if (!isColumnarTableDataset(dataset) || !hasSupportedWasmColumn(dataset)) {
    return new JsVizTableIndex(dataset);
  }

  if (option === "wasm") {
    return new RustWasmVizTableIndex(dataset);
  }

  if (option === "auto" && getTableRowCount(dataset) >= 100_000) {
    return new RustWasmVizTableIndex(dataset);
  }

  return new JsVizTableIndex(dataset);
}

function isColumnarTableDataset<TRow>(
  dataset: VizTableDataset<TRow>,
): dataset is VizTableColumnarDataset {
  return !("rows" in dataset);
}

function getTableRowCount<TRow>(dataset: VizTableDataset<TRow>) {
  if ("rows" in dataset) {
    return dataset.rows.length;
  }

  return Math.max(
    dataset.rowIds?.length ?? 0,
    ...dataset.columns.map((column) => column.values.length),
  );
}

function hasSupportedWasmColumn(dataset: VizTableColumnarDataset) {
  return dataset.columns.some(
    (column) =>
      column.type === "number" ||
      column.type === "date" ||
      column.type === "boolean" ||
      column.type === "string",
  );
}

function normalizeBackendConfig(
  option: VizBackendOption | VizBackendConfig,
): Required<VizBackendConfig> {
  if (typeof option === "string") {
    return {
      finance: option,
      geo: option,
      table: option,
      xy: option,
    };
  }

  return {
    finance: option.finance ?? option.xy ?? "auto",
    geo: option.geo ?? option.xy ?? "auto",
    table: option.table ?? option.xy ?? "auto",
    xy: option.xy ?? "auto",
  };
}

export function resolveFrameBackend<TProperties>(
  backend: VizEngineBackend<TProperties>,
  indexes: Array<VizDatasetIndex<TProperties>>,
) {
  const backends = new Set(indexes.map((index) => backend.resolveBackend(index)));

  if (backends.size > 1) {
    return "mixed" as const;
  }

  return backends.has("wasm") ? ("wasm" as const) : ("js" as const);
}

export function resolveFrameBackendImplementation<TProperties>(
  indexes: Array<VizDatasetIndex<TProperties>>,
) {
  const implementations = new Set(
    indexes.map((index) => {
      const capabilities = index.index.getBackendCapabilities();

      return capabilities.implementation ?? (capabilities.backend === "js" ? "js" : "legacy-wasm");
    }),
  );

  if (implementations.size > 1) {
    return "mixed" as const;
  }

  return implementations.values().next().value ?? ("js" as const);
}
