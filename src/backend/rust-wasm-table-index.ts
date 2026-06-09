import { initVizEngineWasm, VizEngineWasmTableIndex } from "../wasm/viz-engine-wasm-bindings";
import { JsVizTableIndex } from "./js-table-index";

import type {
  VizTableColumnarDataset,
  VizTableDataset,
  VizTableFilter,
  VizTableIndex,
  VizTableQuery,
  VizTableResult,
  VizTableRow,
  VizTypedTable,
} from "../types";

type WasmTableIndex = InstanceType<typeof VizEngineWasmTableIndex>;

export class RustWasmVizTableIndex<TRow = Record<string, unknown>> implements VizTableIndex {
  private readonly jsIndex: JsVizTableIndex<TRow>;
  private readonly wasmIndex: WasmTableIndex | null;
  private readonly wasmColumnsById: Map<
    string,
    { kind: "boolean" | "numeric"; wasmColumnIndex: number }
  >;

  constructor(dataset: VizTableDataset<TRow>) {
    this.jsIndex = new JsVizTableIndex(dataset);
    const wasmInput = "rows" in dataset ? null : createWasmTableInput(dataset);
    if (wasmInput) {
      initVizEngineWasm();
    }
    this.wasmIndex = wasmInput ? new VizEngineWasmTableIndex(wasmInput.input) : null;
    this.wasmColumnsById = wasmInput?.columnsById ?? new Map();
  }

  getBackendCapabilities() {
    return {
      backend: this.wasmIndex ? ("wasm" as const) : ("js" as const),
      implementation: this.wasmIndex ? ("rust-viz-engine-wasm" as const) : ("js" as const),
      usesWasm: this.wasmIndex != null,
    };
  }

  getRowById(rowId: string): VizTableRow | null {
    return this.jsIndex.getRowById(rowId);
  }

  getRowCount() {
    return this.jsIndex.getRowCount();
  }

  getSchema() {
    return this.jsIndex.getSchema();
  }

  getTable(query: VizTableQuery = {}): VizTableResult {
    this.tryWasmQuery(query);
    return this.jsIndex.getTable(query);
  }

  getTypedTable(query: VizTableQuery = {}): VizTypedTable {
    this.tryWasmQuery(query);
    return this.jsIndex.getTypedTable(query);
  }

  private tryWasmQuery(query: VizTableQuery) {
    if (!this.wasmIndex || !this.isSupportedWasmQuery(query)) {
      return null;
    }

    const sort = query.sort?.[0];
    const firstFilter = query.filters?.[0];
    if (sort) {
      const column = this.wasmColumnsById.get(sort.columnId);
      if (column?.kind === "numeric") {
        return this.wasmIndex.sortNumeric(
          column.wasmColumnIndex,
          sort.direction,
          sort.nulls ?? "last",
          query.rowOffset ?? 0,
          query.rowLimit,
        );
      }
      if (column?.kind === "boolean") {
        return this.wasmIndex.sortBoolean(
          column.wasmColumnIndex,
          sort.direction,
          sort.nulls ?? "last",
          query.rowOffset ?? 0,
          query.rowLimit,
        );
      }
    }

    if (firstFilter) {
      const column = this.wasmColumnsById.get(firstFilter.columnId);
      if (column?.kind === "numeric") {
        return this.wasmIndex.queryNumeric({
          filters: (query.filters ?? []).map((filter) => ({
            columnIndex: this.wasmColumnsById.get(filter.columnId)?.wasmColumnIndex ?? -1,
            maxValue: Array.isArray(filter.value) ? Number(filter.value[1]) : undefined,
            operator: filter.operator,
            value: Array.isArray(filter.value) ? Number(filter.value[0]) : Number(filter.value),
          })),
          rowLimit: query.rowLimit,
          rowOffset: query.rowOffset ?? 0,
          sort: sort
            ? {
                columnIndex: this.wasmColumnsById.get(sort.columnId)?.wasmColumnIndex ?? -1,
                direction: sort.direction,
                nulls: sort.nulls ?? "last",
              }
            : undefined,
        });
      }

      if (column?.kind === "boolean") {
        return this.wasmIndex.queryBoolean(
          column.wasmColumnIndex,
          firstFilter.operator,
          typeof firstFilter.value === "boolean" ? firstFilter.value : undefined,
          query.rowOffset ?? 0,
          query.rowLimit,
        );
      }
    }

    return null;
  }

  private isSupportedWasmQuery(query: VizTableQuery) {
    if (query.search?.query) {
      return false;
    }
    if ((query.sort?.length ?? 0) > 1) {
      return false;
    }

    for (const filter of query.filters ?? []) {
      const column = this.wasmColumnsById.get(filter.columnId);
      if (!column || !isWasmFilterSupported(column.kind, filter)) {
        return false;
      }
    }

    for (const sort of query.sort ?? []) {
      const kind = this.wasmColumnsById.get(sort.columnId)?.kind;
      if (kind !== "numeric" && kind !== "boolean") {
        return false;
      }
    }

    return (query.filters?.length ?? 0) > 0 || (query.sort?.length ?? 0) > 0;
  }
}

function createWasmTableInput(dataset: VizTableColumnarDataset) {
  const columnsById = new Map<string, { kind: "boolean" | "numeric"; wasmColumnIndex: number }>();
  const numericColumns = [];
  const booleanColumns = [];

  for (const column of dataset.columns) {
    if (column.type === "number" || column.type === "date") {
      columnsById.set(column.id, {
        kind: "numeric",
        wasmColumnIndex: numericColumns.length,
      });
      numericColumns.push({
        columnType: column.type === "date" ? "date" : "number",
        validity: column.validity ? Array.from(column.validity) : undefined,
        values: Array.from(column.values as ArrayLike<number>),
      });
    }

    if (column.type === "boolean") {
      columnsById.set(column.id, {
        kind: "boolean",
        wasmColumnIndex: booleanColumns.length,
      });
      booleanColumns.push({
        validity: column.validity ? Array.from(column.validity) : undefined,
        values: Array.from(column.values as ArrayLike<number>),
      });
    }
  }

  if (numericColumns.length === 0 && booleanColumns.length === 0) {
    return null;
  }

  return {
    columnsById,
    input: {
      booleanColumns,
      numericColumns,
    },
  };
}

function isWasmFilterSupported(kind: "boolean" | "numeric", filter: VizTableFilter) {
  if (kind === "boolean") {
    return ["equals", "notEquals", "isNull", "isNotNull"].includes(filter.operator);
  }

  return ["between", "equals", "gt", "gte", "isNotNull", "isNull", "lt", "lte", "notEquals"]
    .includes(filter.operator);
}
