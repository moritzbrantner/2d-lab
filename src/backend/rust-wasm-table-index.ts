import { JsVizTableIndex } from "./js-table-index";
import {
  isAsciiString,
  planTableWasmQuery,
  type VizTableWasmPlan,
  type WasmTableColumnRef,
} from "./table-wasm-plan";
import { createBackendDiagnostic } from "../diagnostics";

import type {
  VizFrameDiagnostic,
  VizTableColumnSummary,
  VizTableColumnType,
  VizTableColumnarDataset,
  VizTableDataset,
  VizTableFilter,
  VizTableIndex,
  VizTableQuery,
  VizTableResult,
  VizTableRow,
  VizTypedTable,
} from "../types";
import type { VizWasmModule } from "../wasm/types";

type WasmTableIndex = {
  addAsciiStringColumn(values: Array<string | null>, validity?: Uint8Array): number;
  addBooleanColumn(values: Uint8Array, validity?: Uint8Array): number;
  addNumericColumn(kind: "date" | "number", values: Float64Array, validity?: Uint8Array): number;
  queryBoolean(...args: unknown[]): unknown;
  queryNumeric(...args: unknown[]): unknown;
  queryPlanned?(query: unknown): unknown;
  queryStringFilter(...args: unknown[]): unknown;
  queryStringSearch(...args: unknown[]): unknown;
  sortBoolean(...args: unknown[]): unknown;
  sortNumeric(...args: unknown[]): unknown;
  free?(): void;
};
type WasmTableIndexConstructor = new () => WasmTableIndex;
type WasmTableQueryResult = {
  filteredRowCount: number;
  sourceIndex: Uint32Array;
};

/** Experimental table wrapper for supported columnar datasets with JS fallback paths. */
export class RustWasmVizTableIndex<TRow = Record<string, unknown>> implements VizTableIndex {
  private readonly jsIndex: JsVizTableIndex<TRow>;
  private readonly wasmColumnsById: Map<string, WasmTableColumnRef>;
  private readonly wasmIndex: WasmTableIndex | null;
  private lastDiagnostics: VizFrameDiagnostic[] = [];
  private disposed = false;
  private readonly objectRowDataset: boolean;

  constructor(
    dataset: VizTableDataset<TRow>,
    wasmModule: Pick<VizWasmModule, "VizEngineWasmTableIndex" | "initVizEngineWasm">,
  ) {
    this.jsIndex = new JsVizTableIndex(dataset);
    this.objectRowDataset = "rows" in dataset;
    const wasmInput = "rows" in dataset ? null : createWasmTableIndex(dataset, wasmModule);
    this.wasmIndex = wasmInput?.index ?? null;
    this.wasmColumnsById = wasmInput?.columnsById ?? new Map();
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.wasmIndex?.free?.();
    this.disposed = true;
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
    const wasmResult = this.tryWasmQuery(query);
    if (wasmResult) {
      return this.jsIndex.getTableForSourceIndices(
        query,
        wasmResult.sourceIndex,
        wasmResult.filteredRowCount,
      );
    }

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
    return this.explainWasmQuery(query).supported;
  }

  explainWasmQuery(query: VizTableQuery): VizTableWasmPlan {
    if (this.objectRowDataset) {
      return {
        supported: false,
        reason: "object-row-dataset",
        details: { reason: "object-row-dataset" },
      };
    }

    return planTableWasmQuery(query, this.getSchema(), this.wasmColumnsById);
  }

  getDiagnostics() {
    return this.lastDiagnostics;
  }

  private tryWasmQuery(query: VizTableQuery): WasmTableQueryResult | null {
    this.lastDiagnostics = [];
    if (!this.wasmIndex) {
      return null;
    }

    const plan = this.explainWasmQuery(query);
    if (!plan.supported) {
      this.lastDiagnostics.push(
        createBackendDiagnostic({
          code: "wasm-unsupported-query-js-fallback",
          details: plan.details,
          implementation: "js",
          message: "Table query is not supported by the WASM backend; using JavaScript.",
          selected: "js",
        }),
      );
      return null;
    }

    if (this.wasmIndex.queryPlanned) {
      try {
        return this.wasmIndex.queryPlanned(
          this.createPlannedQuery(query, plan),
        ) as WasmTableQueryResult;
      } catch (error) {
        this.lastDiagnostics.push(
          createBackendDiagnostic({
            code: "wasm-query-error-js-fallback",
            details: { message: error instanceof Error ? error.message : String(error) },
            implementation: "js",
            message: "Table WASM query failed; using JavaScript.",
            selected: "js",
          }),
        );
        return null;
      }
    }

    try {
      return this.tryLegacyWasmQuery(query);
    } catch (error) {
      this.lastDiagnostics.push(
        createBackendDiagnostic({
          code: "wasm-query-error-js-fallback",
          details: { message: error instanceof Error ? error.message : String(error) },
          implementation: "js",
          message: "Table WASM query failed; using JavaScript.",
          selected: "js",
        }),
      );
      return null;
    }
  }

  private tryLegacyWasmQuery(query: VizTableQuery): WasmTableQueryResult | null {
    if (query.search?.query) {
      const searchColumnIndices = this.resolveWasmSearchColumnIndices(query);
      if (searchColumnIndices.length > 0) {
        return this.wasmIndex!.queryStringSearch(
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
        return this.wasmIndex!.queryNumeric({
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
        return this.wasmIndex!.queryBoolean(
          column.wasmColumnIndex,
          firstFilter.operator,
          typeof firstFilter.value === "boolean" ? firstFilter.value : undefined,
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }

      if (column?.kind === "string") {
        return this.wasmIndex!.queryStringFilter(
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
        return this.wasmIndex!.sortNumeric(
          column.wasmColumnIndex,
          sort.direction,
          sort.nulls ?? "last",
          query.rowOffset ?? 0,
          query.rowLimit,
        ) as WasmTableQueryResult;
      }
      if (column?.kind === "boolean") {
        return this.wasmIndex!.sortBoolean(
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

  private createPlannedQuery(
    query: VizTableQuery,
    plan: Extract<VizTableWasmPlan, { supported: true }>,
  ) {
    const schemaById = new Map(this.getSchema().map((column) => [column.id, column]));
    return {
      filters: plan.filters.map((filter) => {
        const column = schemaById.get(filter.columnId)!;
        const wasmColumn = plan.wasmColumnsById.get(filter.columnId)!;
        return {
          columnIndex: wasmColumn.wasmColumnIndex,
          columnKind: plannedColumnKind(column.type),
          operator: filter.operator,
          value: plannedFilterValue(filter, column.type),
        };
      }),
      rowLimit: query.rowLimit,
      rowOffset: query.rowOffset ?? 0,
      search: plan.search?.query
        ? {
            caseSensitive: plan.search.caseSensitive ?? false,
            columnIndices: this.resolveWasmSearchColumnIndices(query),
            query: plan.search.query,
          }
        : undefined,
      sort: (plan.sort ?? []).map((sort) => {
        const column = schemaById.get(sort.columnId)!;
        const wasmColumn = plan.wasmColumnsById.get(sort.columnId)!;
        return {
          columnIndex: wasmColumn.wasmColumnIndex,
          columnKind: plannedColumnKind(column.type),
          direction: sort.direction,
          nulls: sort.nulls ?? "last",
        };
      }),
    };
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

function createWasmTableIndex(
  dataset: VizTableColumnarDataset,
  wasmModule: Pick<VizWasmModule, "VizEngineWasmTableIndex" | "initVizEngineWasm">,
) {
  wasmModule.initVizEngineWasm();
  const TableIndex = wasmModule.VizEngineWasmTableIndex as WasmTableIndexConstructor;
  const index = new TableIndex();
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
          supportsSort: supportsAsciiStringSort(values),
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

function supportsAsciiStringSort(values: readonly (string | null)[]) {
  return values.every((value) => value == null || value === value.toLowerCase());
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

function plannedColumnKind(type: VizTableColumnType) {
  switch (type) {
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "number":
    default:
      return "number";
  }
}

function plannedFilterValue(filter: VizTableFilter, type: VizTableColumnType) {
  if (type === "boolean") {
    return {
      kind: "boolean",
      value: typeof filter.value === "boolean" ? filter.value : undefined,
    };
  }

  if (type === "string") {
    return {
      caseSensitive: filter.caseSensitive ?? false,
      kind: "string",
      value: typeof filter.value === "string" ? filter.value : undefined,
    };
  }

  return {
    kind: "numeric",
    maxValue: numericFilterMaxValue(filter),
    value: numericFilterValue(filter),
  };
}
