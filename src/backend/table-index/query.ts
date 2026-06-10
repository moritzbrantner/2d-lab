import type { VizTableCellValue, VizTableColumnType, VizTableFilter } from "../../types";
import type { NormalizedColumn } from "./types";
import {
  compareFilterValue,
  normalizeText,
  numberValue,
  numericCompare,
  stableStringValue,
  valueToSearchText,
} from "./values";

export function resolveColumnIds(
  columns: readonly NormalizedColumn[],
  columnIds: readonly string[] | undefined,
) {
  if (!columnIds) {
    return columns.map((column) => column.summary.id);
  }

  const known = new Set(columns.map((column) => column.summary.id));
  return columnIds.filter((columnId) => known.has(columnId));
}

export function resolveSearchColumns(
  columns: readonly NormalizedColumn[],
  columnIds: readonly string[] | undefined,
) {
  const requested = columnIds ? new Set(columnIds) : null;

  return columns.filter(
    (column) => column.summary.searchable && (!requested || requested.has(column.summary.id)),
  );
}

export function sortRows(
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

export function rowMatchesFilter(value: VizTableCellValue | null, filter: VizTableFilter) {
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

export function normalizeRowOffset(rowOffset: number | undefined) {
  return Number.isFinite(rowOffset) ? Math.max(0, Math.trunc(rowOffset ?? 0)) : 0;
}

export function normalizeRowLimit(rowLimit: number | undefined) {
  if (rowLimit === 0) {
    return 0;
  }

  return Number.isFinite(rowLimit) && rowLimit! > 0 ? Math.trunc(rowLimit!) : 100;
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
