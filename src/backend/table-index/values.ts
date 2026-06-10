import type { VizTableCellValue } from "../../types";

export function compareFilterValue(
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

export function numericCompare(
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

export function numberValue(value: VizTableCellValue | null | undefined) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function valueToSearchText(value: VizTableCellValue | null | undefined) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return stableStringValue(value);
}

export function stableStringValue(value: unknown): string {
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

export function normalizeText(value: string, caseSensitive: boolean | undefined) {
  return caseSensitive ? value : value.toLocaleLowerCase();
}
