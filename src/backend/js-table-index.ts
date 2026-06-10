import type {
  VizTableDataset,
  VizTableIndex,
  VizTableQuery,
  VizTableResult,
  VizTableRow,
  VizTypedTable,
  VizTypedTableColumn,
} from "../types";
import { normalizeTableDataset } from "./table-index/normalize";
import {
  isFilterCompatible,
  normalizeRowLimit,
  normalizeRowOffset,
  resolveColumnIds,
  resolveSearchColumns,
  rowMatchesFilter,
  sortRows,
} from "./table-index/query";
import type { NormalizedColumn, QueryResult } from "./table-index/types";
import { normalizeText, numberValue, valueToSearchText } from "./table-index/values";

export { isFilterCompatible, normalizeRowLimit, normalizeRowOffset };

export class JsVizTableIndex<TRow = Record<string, unknown>> implements VizTableIndex {
  private readonly columns: NormalizedColumn[];
  private readonly columnsById: Map<string, NormalizedColumn>;
  private readonly rowIds: string[];
  private readonly rowIdToIndex: Map<string, number>;
  private readonly rowCount: number;

  constructor(dataset: VizTableDataset<TRow>) {
    const normalized = normalizeTableDataset(dataset);
    this.columns = normalized.columns;
    this.columnsById = new Map(this.columns.map((column) => [column.summary.id, column]));
    this.rowIds = normalized.rowIds;
    this.rowCount = normalized.rowCount;
    this.rowIdToIndex = new Map(this.rowIds.map((rowId, index) => [rowId, index]));
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }

  getRowById(rowId: string): VizTableRow | null {
    const sourceIndex = this.rowIdToIndex.get(rowId);
    if (sourceIndex == null) {
      return null;
    }

    return this.createRow(
      sourceIndex,
      this.columns.map((column) => column.summary.id),
    );
  }

  getRowCount() {
    return this.rowCount;
  }

  getSchema() {
    return this.columns.map((column) => column.summary);
  }

  getTable(query: VizTableQuery = {}): VizTableResult {
    return this.getTableForResolvedQuery(this.resolveQuery(query));
  }

  /** @internal Used by WASM table wrappers after Rust returns source row indices. */
  getTableForSourceIndices(
    query: VizTableQuery,
    rowIndices: readonly number[] | Uint32Array,
    filteredRowCount: number,
  ): VizTableResult {
    return this.getTableForResolvedQuery({
      columnIds: resolveColumnIds(this.columns, query.columnIds),
      filteredRowCount,
      rowIndices: Array.from(rowIndices),
      rowLimit: normalizeRowLimit(query.rowLimit),
      rowOffset: normalizeRowOffset(query.rowOffset),
    });
  }

  getTypedTable(query: VizTableQuery = {}): VizTypedTable {
    const result = this.resolveQuery(query);

    return this.getTypedTableForSourceIndices(query, result.rowIndices, result.filteredRowCount);
  }

  /** @internal Used by experimental WASM table wrappers after Rust returns source row indices. */
  getTypedTableForSourceIndices(
    query: VizTableQuery,
    rowIndices: readonly number[] | Uint32Array,
    filteredRowCount: number,
  ): VizTypedTable {
    const normalizedRowIndices = Array.from(rowIndices);
    const columnIds = resolveColumnIds(this.columns, query.columnIds);
    const typedColumns = columnIds.map((columnId) =>
      this.createTypedColumn(this.columnsById.get(columnId)!, normalizedRowIndices),
    );

    return {
      columns: columnIds.map((columnId) => this.columnsById.get(columnId)!.summary),
      rowIds: normalizedRowIndices.map((index) => this.rowIds[index] ?? String(index)),
      sourceIndex: Uint32Array.from(normalizedRowIndices),
      summary: {
        filteredRowCount,
        rowCount: this.rowCount,
        rowLimit: normalizeRowLimit(query.rowLimit),
        rowOffset: normalizeRowOffset(query.rowOffset),
        visibleRowCount: normalizedRowIndices.length,
      },
      typedColumns,
    };
  }

  private getTableForResolvedQuery(result: QueryResult): VizTableResult {
    return {
      columns: result.columnIds.map((columnId) => this.columnsById.get(columnId)!.summary),
      rows: result.rowIndices.map((sourceIndex) => this.createRow(sourceIndex, result.columnIds)),
      summary: {
        filteredRowCount: result.filteredRowCount,
        rowCount: this.rowCount,
        rowLimit: result.rowLimit,
        rowOffset: result.rowOffset,
        visibleRowCount: result.rowIndices.length,
      },
    };
  }

  private resolveQuery(query: VizTableQuery): QueryResult {
    const columnIds = resolveColumnIds(this.columns, query.columnIds);
    const filtered = this.getFilteredIndices(query);
    const filteredRowCount = filtered.length;
    const sorted = sortRows(filtered, query.sort, this.columnsById);
    const rowOffset = normalizeRowOffset(query.rowOffset);
    const rowLimit = normalizeRowLimit(query.rowLimit);

    return {
      columnIds,
      filteredRowCount,
      rowIndices: sorted.slice(rowOffset, rowOffset + rowLimit),
      rowLimit,
      rowOffset,
    };
  }

  private getFilteredIndices(query: VizTableQuery) {
    let rowIndices = Array.from({ length: this.rowCount }, (_, index) => index);

    for (const filter of query.filters ?? []) {
      const column = this.columnsById.get(filter.columnId);
      if (!column || !isFilterCompatible(column.summary.type, filter)) {
        return [];
      }
      rowIndices = rowIndices.filter((index) => rowMatchesFilter(column.values[index], filter));
    }

    if (query.search?.query) {
      const searchColumns = resolveSearchColumns(this.columns, query.search.columnIds);
      const needle = normalizeText(query.search.query, query.search.caseSensitive);
      rowIndices = rowIndices.filter((index) =>
        searchColumns.some((column) =>
          normalizeText(
            valueToSearchText(column.values[index]),
            query.search?.caseSensitive,
          ).includes(needle),
        ),
      );
    }

    return rowIndices;
  }

  private createRow(sourceIndex: number, columnIds: readonly string[]): VizTableRow {
    return {
      cells: columnIds.map((columnId) => ({
        columnId,
        value: this.columnsById.get(columnId)?.values[sourceIndex] ?? null,
      })),
      rowId: this.rowIds[sourceIndex] ?? String(sourceIndex),
      sourceIndex,
    };
  }

  private createTypedColumn(
    column: NormalizedColumn,
    rowIndices: readonly number[],
  ): VizTypedTableColumn {
    const validity = Uint8Array.from(rowIndices, (sourceIndex) =>
      column.values[sourceIndex] == null ? 0 : 1,
    );

    if (column.summary.type === "number" || column.summary.type === "date") {
      return {
        id: column.summary.id,
        type: column.summary.type,
        validity,
        values: Float64Array.from(
          rowIndices,
          (sourceIndex) => numberValue(column.values[sourceIndex]) ?? Number.NaN,
        ),
      };
    }

    if (column.summary.type === "boolean") {
      return {
        id: column.summary.id,
        type: "boolean",
        validity,
        values: Uint8Array.from(rowIndices, (sourceIndex) =>
          column.values[sourceIndex] === true ? 1 : 0,
        ),
      };
    }

    return {
      id: column.summary.id,
      type: column.summary.type,
      validity,
      values: rowIndices.map((sourceIndex) => column.values[sourceIndex] ?? null),
    };
  }
}
