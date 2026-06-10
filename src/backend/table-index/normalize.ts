import type {
  VizTableCellValue,
  VizTableColumnDefinition,
  VizTableColumnSummary,
  VizTableColumnType,
  VizTableDataset,
} from "../../types";
import type { NormalizedColumn, NormalizedTableDataset } from "./types";
import { numberValue } from "./values";

export function normalizeTableDataset<TRow>(
  dataset: VizTableDataset<TRow>,
): NormalizedTableDataset {
  return "rows" in dataset ? normalizeObjectDataset(dataset) : normalizeColumnarDataset(dataset);
}

function normalizeObjectDataset<TRow>(
  dataset: Extract<VizTableDataset<TRow>, { rows: readonly TRow[] }>,
): NormalizedTableDataset {
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
): NormalizedTableDataset {
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
