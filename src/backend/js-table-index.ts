import type {
  VizTableCellValue,
  VizTableColumnDefinition,
  VizTableColumnSummary,
  VizTableColumnType,
  VizTableDataset,
  VizTableFilter,
  VizTableIndex,
  VizTableQuery,
  VizTableResult,
  VizTableRow,
  VizTypedTable,
  VizTypedTableColumn,
} from "../types";

type NormalizedColumn = {
  definition: VizTableColumnDefinition;
  summary: VizTableColumnSummary;
  values: Array<VizTableCellValue | null>;
};

type QueryResult = {
  columnIds: string[];
  rowIndices: number[];
  rowLimit: number;
  rowOffset: number;
};

export class JsVizTableIndex<TRow = Record<string, unknown>> implements VizTableIndex {
  private readonly columns: NormalizedColumn[];
  private readonly columnsById: Map<string, NormalizedColumn>;
  private readonly rowIds: string[];
  private readonly rowIdToIndex: Map<string, number>;
  private readonly rowCount: number;

  constructor(dataset: VizTableDataset<TRow>) {
    const normalized =
      "rows" in dataset ? normalizeObjectDataset(dataset) : normalizeColumnarDataset(dataset);
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
    const result = this.resolveQuery(query);

    return {
      columns: result.columnIds.map((columnId) => this.columnsById.get(columnId)!.summary),
      rows: result.rowIndices.map((sourceIndex) => this.createRow(sourceIndex, result.columnIds)),
      summary: {
        filteredRowCount: this.getFilteredRowCount(query),
        rowCount: this.rowCount,
        rowLimit: result.rowLimit,
        rowOffset: result.rowOffset,
        visibleRowCount: result.rowIndices.length,
      },
    };
  }

  getTypedTable(query: VizTableQuery = {}): VizTypedTable {
    const result = this.resolveQuery(query);
    const sourceIndex = Uint32Array.from(result.rowIndices);
    const typedColumns = result.columnIds.map((columnId) =>
      this.createTypedColumn(this.columnsById.get(columnId)!, result.rowIndices),
    );

    return {
      columns: result.columnIds.map((columnId) => this.columnsById.get(columnId)!.summary),
      rowIds: result.rowIndices.map((index) => this.rowIds[index] ?? String(index)),
      sourceIndex,
      summary: {
        filteredRowCount: this.getFilteredRowCount(query),
        rowCount: this.rowCount,
        rowLimit: result.rowLimit,
        rowOffset: result.rowOffset,
        visibleRowCount: result.rowIndices.length,
      },
      typedColumns,
    };
  }

  private resolveQuery(query: VizTableQuery): QueryResult {
    const columnIds = resolveColumnIds(this.columns, query.columnIds);
    const filtered = this.getFilteredIndices(query);
    const sorted = sortRows(filtered, query.sort, this.columnsById);
    const rowOffset = normalizeRowOffset(query.rowOffset);
    const rowLimit = normalizeRowLimit(query.rowLimit);
    const rowIndices = sorted.slice(rowOffset, rowOffset + rowLimit);

    return {
      columnIds,
      rowIndices,
      rowLimit,
      rowOffset,
    };
  }

  private getFilteredRowCount(query: VizTableQuery) {
    return this.getFilteredIndices(query).length;
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

function normalizeObjectDataset<TRow>(
  dataset: Extract<VizTableDataset<TRow>, { rows: readonly TRow[] }>,
) {
  const definitions = resolveObjectColumnDefinitions(dataset.rows, dataset.columns);
  const rowIds = dataset.rows.map((row, index) => {
    const rowIdValue =
      dataset.rowIdKey && row && typeof row === "object"
        ? (row as Record<string, unknown>)[dataset.rowIdKey]
        : null;

    return rowIdValue == null ? String(index) : String(rowIdValue);
  });
  const columns = definitions.map((definition) => {
    const key = definition.key ?? definition.id;
    const values = dataset.rows.map((row) =>
      normalizeCellValue(
        row && typeof row === "object" ? (row as Record<string, unknown>)[key] : null,
      ),
    );

    return createNormalizedColumn(definition, values);
  });

  return {
    columns,
    rowCount: dataset.rows.length,
    rowIds,
  };
}

function normalizeColumnarDataset(
  dataset: Extract<VizTableDataset, { rowIds?: readonly string[] }>,
) {
  const rowCount = dataset.columns.reduce(
    (count, column) => Math.max(count, column.values.length),
    dataset.rowIds?.length ?? 0,
  );
  const rowIds = Array.from(
    { length: rowCount },
    (_, index) => dataset.rowIds?.[index] ?? String(index),
  );
  const columns = dataset.columns.map((column) => {
    const values = Array.from({ length: rowCount }, (_, index) => {
      if (column.validity && column.validity[index] === 0) {
        return null;
      }

      return normalizeCellValueForColumn(column.values[index], column.type);
    });

    return createNormalizedColumn(column, values);
  });

  return {
    columns,
    rowCount,
    rowIds,
  };
}

function resolveObjectColumnDefinitions<TRow>(
  rows: readonly TRow[],
  explicitColumns: readonly VizTableColumnDefinition[] | undefined,
): readonly VizTableColumnDefinition[] {
  if (explicitColumns?.length) {
    return explicitColumns;
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  return keys.map((key) => ({ id: key }));
}

function createNormalizedColumn(
  definition: VizTableColumnDefinition,
  values: Array<VizTableCellValue | null>,
): NormalizedColumn {
  const type = definition.type ?? inferColumnType(values);
  const summary = summarizeColumn(definition, type, values);

  return {
    definition,
    summary,
    values,
  };
}

function summarizeColumn(
  definition: VizTableColumnDefinition,
  type: VizTableColumnType,
  values: readonly (VizTableCellValue | null)[],
): VizTableColumnSummary {
  let nullCount = 0;
  let nonNullCount = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (value == null) {
      nullCount += 1;
      continue;
    }

    nonNullCount += 1;
    const numeric = numberValue(value);
    if (numeric != null && (type === "number" || type === "date")) {
      min = Math.min(min, numeric);
      max = Math.max(max, numeric);
    }
  }

  return {
    filterable: definition.filterable ?? true,
    id: definition.id,
    label: definition.label ?? definition.id,
    max: Number.isFinite(max) ? max : undefined,
    meta: definition.meta,
    min: Number.isFinite(min) ? min : undefined,
    nonNullCount,
    nullable: definition.nullable ?? nullCount > 0,
    nullCount,
    searchable:
      definition.searchable ?? (type === "string" || type === "json" || type === "unknown"),
    sortable: definition.sortable ?? true,
    type,
  };
}

function inferColumnType(values: readonly (VizTableCellValue | null)[]): VizTableColumnType {
  let inferred: VizTableColumnType | null = null;

  for (const value of values) {
    if (value == null) {
      continue;
    }

    const valueType = inferValueType(value);
    if (!inferred) {
      inferred = valueType;
      continue;
    }

    if (inferred !== valueType) {
      return "unknown";
    }
  }

  return inferred ?? "unknown";
}

function inferValueType(value: VizTableCellValue): VizTableColumnType {
  if (value instanceof Date) {
    return "date";
  }

  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object":
      return "json";
    default:
      return "unknown";
  }
}

function normalizeCellValue(value: unknown): VizTableCellValue | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return String(value);
}

function normalizeCellValueForColumn(
  value: unknown,
  type: VizTableColumnType | undefined,
): VizTableCellValue | null {
  if (type === "boolean" && value != null) {
    return value === true || value === 1;
  }

  return normalizeCellValue(value);
}

function resolveColumnIds(
  columns: readonly NormalizedColumn[],
  columnIds: readonly string[] | undefined,
) {
  if (!columnIds) {
    return columns.map((column) => column.summary.id);
  }

  const known = new Set(columns.map((column) => column.summary.id));
  return columnIds.filter((columnId) => known.has(columnId));
}

function resolveSearchColumns(
  columns: readonly NormalizedColumn[],
  columnIds: readonly string[] | undefined,
) {
  const requested = columnIds ? new Set(columnIds) : null;

  return columns.filter(
    (column) => column.summary.searchable && (!requested || requested.has(column.summary.id)),
  );
}

function sortRows(
  rowIndices: readonly number[],
  sort:
    | readonly { columnId: string; direction: "asc" | "desc"; nulls?: "first" | "last" }[]
    | undefined,
  columnsById: Map<string, NormalizedColumn>,
) {
  if (!sort?.length) {
    return [...rowIndices];
  }

  return [...rowIndices].sort((leftIndex, rightIndex) => {
    for (const sortEntry of sort) {
      const column = columnsById.get(sortEntry.columnId);
      if (!column) {
        continue;
      }

      const comparison = compareValues(
        column.values[leftIndex],
        column.values[rightIndex],
        column.summary.type,
        sortEntry.nulls ?? "last",
      );
      if (comparison !== 0) {
        return sortEntry.direction === "asc" ? comparison : -comparison;
      }
    }

    return leftIndex - rightIndex;
  });
}

function compareValues(
  left: VizTableCellValue | null,
  right: VizTableCellValue | null,
  type: VizTableColumnType,
  nulls: "first" | "last",
) {
  const leftNull = left == null;
  const rightNull = right == null;
  if (leftNull || rightNull) {
    if (leftNull && rightNull) {
      return 0;
    }
    return leftNull ? (nulls === "first" ? -1 : 1) : nulls === "first" ? 1 : -1;
  }

  if (type === "number" || type === "date") {
    return (numberValue(left) ?? 0) - (numberValue(right) ?? 0);
  }

  if (type === "boolean") {
    return Number(left === true) - Number(right === true);
  }

  return stableStringValue(left).localeCompare(stableStringValue(right));
}

function rowMatchesFilter(value: VizTableCellValue | null, filter: VizTableFilter) {
  switch (filter.operator) {
    case "isNull":
      return value == null;
    case "isNotNull":
      return value != null;
    case "equals":
      return compareFilterValue(value, filter.value, filter.caseSensitive) === 0;
    case "notEquals":
      return compareFilterValue(value, filter.value, filter.caseSensitive) !== 0;
    case "contains":
      return normalizeText(valueToSearchText(value), filter.caseSensitive).includes(
        normalizeText(String(filter.value ?? ""), filter.caseSensitive),
      );
    case "startsWith":
      return normalizeText(valueToSearchText(value), filter.caseSensitive).startsWith(
        normalizeText(String(filter.value ?? ""), filter.caseSensitive),
      );
    case "endsWith":
      return normalizeText(valueToSearchText(value), filter.caseSensitive).endsWith(
        normalizeText(String(filter.value ?? ""), filter.caseSensitive),
      );
    case "gt":
      return numericCompare(value, filter.value) > 0;
    case "gte":
      return numericCompare(value, filter.value) >= 0;
    case "lt":
      return numericCompare(value, filter.value) < 0;
    case "lte":
      return numericCompare(value, filter.value) <= 0;
    case "between": {
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        return false;
      }
      const numeric = numberValue(value);
      const min = numberValue(filter.value[0]);
      const max = numberValue(filter.value[1]);
      return numeric != null && min != null && max != null && numeric >= min && numeric <= max;
    }
    case "in":
      return Array.isArray(filter.value)
        ? filter.value.some(
            (candidate) => compareFilterValue(value, candidate, filter.caseSensitive) === 0,
          )
        : false;
  }
}

export function isFilterCompatible(type: VizTableColumnType, filter: VizTableFilter) {
  switch (filter.operator) {
    case "isNull":
    case "isNotNull":
    case "equals":
    case "notEquals":
    case "in":
      return true;
    case "contains":
    case "startsWith":
    case "endsWith":
      return type === "string" || type === "json" || type === "unknown";
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "between":
      return type === "number" || type === "date";
  }
}

function compareFilterValue(
  value: VizTableCellValue | null,
  expected: VizTableCellValue | readonly VizTableCellValue[] | undefined,
  caseSensitive: boolean | undefined,
) {
  if (value == null || expected == null || Array.isArray(expected)) {
    return value === expected ? 0 : -1;
  }

  if (typeof value === "string" || typeof expected === "string") {
    return normalizeText(String(value), caseSensitive).localeCompare(
      normalizeText(String(expected), caseSensitive),
    );
  }

  return stableStringValue(value).localeCompare(stableStringValue(expected));
}

function numericCompare(
  value: VizTableCellValue | null,
  expected: VizTableCellValue | readonly VizTableCellValue[] | undefined,
) {
  if (Array.isArray(expected)) {
    return Number.NaN;
  }

  const left = numberValue(value);
  const right = numberValue(expected);
  if (left == null || right == null) {
    return Number.NaN;
  }

  return left - right;
}

function numberValue(value: VizTableCellValue | null | undefined) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valueToSearchText(value: VizTableCellValue | null | undefined) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return stableStringValue(value);
}

function stableStringValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return String(value.getTime());
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringValue).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${stableStringValue(record[key])}`)
      .join(",")}}`;
  }

  return String(value);
}

function normalizeText(value: string, caseSensitive: boolean | undefined) {
  return caseSensitive ? value : value.toLocaleLowerCase();
}

export function normalizeRowOffset(rowOffset: number | undefined) {
  return Number.isFinite(rowOffset) ? Math.max(0, Math.trunc(rowOffset ?? 0)) : 0;
}

export function normalizeRowLimit(rowLimit: number | undefined) {
  if (rowLimit === 0) {
    return 0;
  }

  return Number.isFinite(rowLimit) && rowLimit! > 0 ? Math.trunc(rowLimit!) : 100;
}
