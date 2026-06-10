import { JsVizDensityIndex } from "./js-density-index";
import { JsVizFinanceIndex } from "./js-finance-index";
import { JsVizGeoFlowIndex } from "./js-geo-flow-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { JsVizGeoJsonIndex } from "./js-geojson-index";
import { JsVizTableIndex } from "./js-table-index";

import type {
  VizBackendConfig,
  VizBackendImplementation,
  VizBackendOption,
  VizDataset,
  VizDatasetIndex,
  VizDiagnosticCode,
  VizEngineBackend,
  VizFrameDiagnostic,
  VizTableColumnarDataset,
  VizTableDataset,
  VizTableIndex,
} from "../types";

export function createJsDatasetIndex<TProperties>(
  dataset: VizDataset<TProperties>,
  metadata: Partial<VizDatasetIndex<TProperties>> = {},
): VizDatasetIndex<TProperties> {
  const base = {
    backendImplementation: "js" as const,
    selectedBackend: "js" as const,
    ...metadata,
  };
  switch (dataset.kind) {
    case "geo-points":
      return { ...base, index: new JsVizGeoPointIndex(dataset.points), kind: "geo-points" };
    case "geojson":
      return { ...base, index: new JsVizGeoJsonIndex(dataset.featureCollection), kind: "geojson" };
    case "geo-flows":
      return { ...base, index: new JsVizGeoFlowIndex(dataset.flows), kind: "geo-flows" };
    case "finance-ohlcv":
      return { ...base, index: new JsVizFinanceIndex(dataset), kind: "finance-ohlcv" };
    case "xy":
      return { ...base, index: new JsVizDensityIndex(dataset), kind: "xy" };
    case "table":
      return { ...base, index: new JsVizTableIndex(dataset), kind: "table" };
  }
}

export function withBackendMetadata<TProperties>(
  index: VizDatasetIndex<TProperties>,
  metadata: {
    requested: VizBackendOption;
    selected?: "js" | "wasm";
    implementation?: VizBackendImplementation;
    fallbackReason?: VizDiagnosticCode | string;
    diagnostics?: VizFrameDiagnostic[];
    details?: Record<string, unknown>;
  },
): VizDatasetIndex<TProperties> {
  const capabilities = index.index.getBackendCapabilities();
  return {
    ...index,
    backendImplementation:
      metadata.implementation ??
      capabilities.implementation ??
      (capabilities.backend === "js" ? "js" : "legacy-wasm"),
    details: metadata.details ?? index.details,
    diagnostics: metadata.diagnostics ?? index.diagnostics,
    fallbackReason: metadata.fallbackReason ?? index.fallbackReason,
    requestedBackend: metadata.requested,
    selectedBackend: metadata.selected ?? capabilities.backend,
  };
}

export function createJsTableIndex<TRow>(dataset: VizTableDataset<TRow>): VizTableIndex {
  return new JsVizTableIndex(dataset);
}

export function isColumnarTableDataset<TRow>(
  dataset: VizTableDataset<TRow>,
): dataset is VizTableColumnarDataset {
  return !("rows" in dataset);
}

export function getTableRowCount<TRow>(dataset: VizTableDataset<TRow>) {
  if ("rows" in dataset) {
    return dataset.rows.length;
  }

  return Math.max(
    dataset.rowIds?.length ?? 0,
    ...dataset.columns.map((column) => column.values.length),
  );
}

export function hasSupportedWasmColumn(dataset: VizTableColumnarDataset) {
  return dataset.columns.some(
    (column) =>
      column.type === "number" ||
      column.type === "date" ||
      column.type === "boolean" ||
      column.type === "string",
  );
}

export function hasAutoWasmTableColumn(dataset: VizTableColumnarDataset) {
  return dataset.columns.some(
    (column) => column.type === "number" || column.type === "date" || column.type === "boolean",
  );
}

export function canUseWasmTableIndex<TRow>(dataset: VizTableDataset<TRow>) {
  return isColumnarTableDataset(dataset) && hasSupportedWasmColumn(dataset);
}

export function shouldAutoUseWasmTableIndex<TRow>(dataset: VizTableDataset<TRow>) {
  return (
    isColumnarTableDataset(dataset) &&
    getTableRowCount(dataset) >= 10_000 &&
    hasAutoWasmTableColumn(dataset)
  );
}

export function normalizeBackendConfig(
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
