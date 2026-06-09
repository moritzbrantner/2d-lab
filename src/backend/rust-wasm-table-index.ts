import { initVizEngineWasm, VizEngineWasmTableIndex } from "../wasm/viz-engine-wasm-bindings";
import { JsVizTableIndex } from "./js-table-index";

import type {
  VizTableColumnSummary,
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
type WasmTableColumnKind = "boolean" | "numeric" | "string";
type WasmTableColumnRef = {
  kind: WasmTableColumnKind;
  wasmColumnIndex: number;
};
type WasmTableQueryResult = {
  filteredRowCount: number;
  sourceIndex: Uint32Array;
};

/** Experimental table wrapper for supported columnar datasets with JS fallback paths. */
export class RustWasmVizTableIndex<TRow = Record<string, unknown>> implements VizTableIndex {
  private readonly jsIndex: JsVizTableIndex<TRow>;
  private readonly wasmColumnsById: Map<string, WasmTableColumnRef>;
  private readonly wasmIndex: WasmTableIndex | null;

  constructor(dataset: VizTableDataset<TRow>) {
    this.jsIndex = new JsVizTableIndex(dataset);
    const wasmInput = "rows" in dataset ? null : createWasmTableIndex(dataset);
    this.wasmIndex = wasmInput?.index ?? null;
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
    return this.jsIndex.getTable(query);
  }

  getTypedTable(query: VizTableQuery = {}): VizTypedTable {
    const wasmResult = this.tryWasmQuery(query);
    if (wasmResult) {
      return this.jsIndex.getTypedTableForSourceIndices(
        query,
        wasmResult.sourceIndex,
        wasmResult.filteredRowCount,
      );
    }

    return this.jsIndex.getTypedTable(query);
  }

  canUseWasmForQuery(query: VizTableQuery) {
    return this.wasmIndex != null && this.isSupportedWasmQuery(query);
  }

  private tryWasmQuery(query: VizTableQuery): WasmTableQueryResult | null {
    if (!this.wasmIndex || !this.isSupportedWasmQuery(query)) {
      return null;
    }

    if (query.search?.query) {
      const searchColumnIndices = this.resolveWasmSearchColumnIndices(query);
      if (searchColumnIndices.length > 0) {
        return this.wasmIndex.queryStringSearch(
          searchColumnIndices,
          query.search.query,
          query.search.caseSensitive ?? false,
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }
    }

    const sort = query.sort?.[0];
    const firstFilter = query.filters?.[0];
    if (firstFilter) {
      const column = this.wasmColumnsById.get(firstFilter.columnId);
      if (column?.kind === "numeric") {
        return this.wasmIndex.queryNumeric({
          filters: (query.filters ?? []).map((filter) => ({
            columnIndex: this.wasmColumnsById.get(filter.columnId)?.wasmColumnIndex ?? -1,
            maxValue: numericFilterMaxValue(filter),
            operator: filter.operator,
            value: numericFilterValue(filter),
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
        }) as WasmTableQueryResult;
      }

      if (column?.kind === "boolean") {
        return this.wasmIndex.queryBoolean(
          column.wasmColumnIndex,
          firstFilter.operator,
          typeof firstFilter.value === "boolean" ? firstFilter.value : undefined,
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }

      if (column?.kind === "string") {
        return this.wasmIndex.queryStringFilter(
          column.wasmColumnIndex,
          firstFilter.operator,
          typeof firstFilter.value === "string" ? firstFilter.value : undefined,
          firstFilter.caseSensitive ?? false,
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }
    }

    if (sort) {
      const column = this.wasmColumnsById.get(sort.columnId);
      if (column?.kind === "numeric") {
        return this.wasmIndex.sortNumeric(
          column.wasmColumnIndex,
          sort.direction,
          sort.nulls ?? "last",
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }
      if (column?.kind === "boolean") {
        return this.wasmIndex.sortBoolean(
          column.wasmColumnIndex,
          sort.direction,
          sort.nulls ?? "last",
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }
    }

    return null;
  }

  private isSupportedWasmQuery(query: VizTableQuery) {
    if ((query.sort?.length ?? 0) > 1) {
      return false;
    }

    const filters = query.filters ?? [];
    const sort = query.sort?.[0];
    if (query.search?.query) {
      return (
        !sort &&
        filters.length === 0 &&
        isAsciiString(query.search.query) &&
        this.resolveWasmSearchColumnIndices(query).length > 0
      );
    }

    for (const filter of filters) {
      const column = this.wasmColumnsById.get(filter.columnId);
      if (!column || !isWasmFilterSupported(column.kind, filter)) {
        return false;
      }
    }

    if (filters.length > 0) {
      const firstFilterKind = this.wasmColumnsById.get(filters[0]!.columnId)?.kind;
      if (firstFilterKind === "numeric") {
        const allFiltersNumeric = filters.every(
          (filter) => this.wasmColumnsById.get(filter.columnId)?.kind === "numeric",
        );
        const sortKind = sort ? this.wasmColumnsById.get(sort.columnId)?.kind : undefined;
        return allFiltersNumeric && (!sort || sortKind === "numeric");
      }

      if (firstFilterKind === "boolean") {
        return filters.length === 1 && !sort;
      }

      return firstFilterKind === "string" && filters.length === 1 && !sort;
    }

    for (const sortEntry of query.sort ?? []) {
      const kind = this.wasmColumnsById.get(sortEntry.columnId)?.kind;
      if (kind !== "numeric" && kind !== "boolean") {
        return false;
      }
    }

    return (query.sort?.length ?? 0) > 0;
  }

  private resolveWasmSearchColumnIndices(query: VizTableQuery) {
    const search = query.search;
    if (!search?.query) {
      return [];
    }
    const requested = search.columnIds ? new Set(search.columnIds) : null;
    const searchColumns = this.getSchema().filter(
      (column) => column.searchable && (!requested || requested.has(column.id)),
    );
    if (searchColumns.length === 0) {
      return [];
    }

    const wasmColumns = [];
    for (const column of searchColumns) {
      const wasmColumn = this.wasmColumnsById.get(column.id);
      if (wasmColumn?.kind !== "string") {
        return [];
      }
      wasmColumns.push(wasmColumn.wasmColumnIndex);
    }
    return wasmColumns;
  }
}

function createWasmTableIndex(dataset: VizTableColumnarDataset) {
  initVizEngineWasm();
  const index = new VizEngineWasmTableIndex();
  const columnsById = new Map<string, WasmTableColumnRef>();

  for (const column of dataset.columns) {
    if (column.type === "number" || column.type === "date") {
      columnsById.set(column.id, {
        kind: "numeric",
        wasmColumnIndex: index.addNumericColumn(
          column.type === "date" ? "date" : "number",
          toFloat64Array(column.values),
          column.validity,
        ),
      });
      continue;
    }

    if (column.type === "boolean") {
      columnsById.set(column.id, {
        kind: "boolean",
        wasmColumnIndex: index.addBooleanColumn(toUint8Array(column.values), column.validity),
      });
      continue;
    }

    if (column.type === "string") {
      const values = toAsciiStringValues(column, dataset.rowIds?.length ?? 0);
      if (values) {
        columnsById.set(column.id, {
          kind: "string",
          wasmColumnIndex: index.addAsciiStringColumn(values, column.validity),
        });
      }
    }
  }

  if (columnsById.size === 0) {
    return null;
  }

  return { columnsById, index };
}

function isWasmFilterSupported(kind: WasmTableColumnKind, filter: VizTableFilter) {
  if (kind === "boolean") {
    return ["equals", "notEquals", "isNull", "isNotNull"].includes(filter.operator);
  }

  if (kind === "string") {
    return (
      ["contains", "endsWith", "equals", "isNotNull", "isNull", "notEquals", "startsWith"].includes(
        filter.operator,
      ) &&
      (filter.operator === "isNull" ||
        filter.operator === "isNotNull" ||
        (typeof filter.value === "string" && isAsciiString(filter.value)))
    );
  }

  return [
    "between",
    "equals",
    "gt",
    "gte",
    "isNotNull",
    "isNull",
    "lt",
    "lte",
    "notEquals",
  ].includes(filter.operator);
}

function toFloat64Array(values: VizTableColumnarDataset["columns"][number]["values"]) {
  return values instanceof Float64Array ? values : Float64Array.from(values as ArrayLike<number>);
}

function toUint8Array(values: VizTableColumnarDataset["columns"][number]["values"]) {
  return values instanceof Uint8Array
    ? values
    : Uint8Array.from(values as ArrayLike<number | boolean>, (value) => (value ? 1 : 0));
}

function toAsciiStringValues(
  column: VizTableColumnarDataset["columns"][number],
  rowIdCount: number,
) {
  const rowCount = Math.max(rowIdCount, column.values.length);
  const values = Array.from({ length: rowCount }, (_, index) => {
    if (column.validity?.[index] === 0) {
      return null;
    }

    const value = column.values[index];
    if (value == null) {
      return null;
    }

    return typeof value === "string" && isAsciiString(value) ? value : undefined;
  });

  return values.some((value) => value === undefined) ? null : (values as Array<string | null>);
}

function isAsciiString(value: string) {
  return /^[\x00-\x7F]*$/.test(value);
}

function numericFilterValue(filter: VizTableFilter) {
  if (filter.operator === "isNull" || filter.operator === "isNotNull") {
    return undefined;
  }
  if (Array.isArray(filter.value)) {
    const value = Number(filter.value[0]);
    return Number.isFinite(value) ? value : undefined;
  }
  const value = Number(filter.value);
  return Number.isFinite(value) ? value : undefined;
}

function numericFilterMaxValue(filter: VizTableFilter) {
  if (!Array.isArray(filter.value)) {
    return undefined;
  }
  const value = Number(filter.value[1]);
  return Number.isFinite(value) ? value : undefined;
}
