import type {
  VizTableColumnSummary,
  VizTableFilter,
  VizTableQuery,
  VizTableSearch,
  VizTableSort,
} from "../types";

export type WasmTableColumnRef = {
  kind: "boolean" | "numeric" | "string";
  supportsSort?: boolean;
  wasmColumnIndex: number;
};

export type VizTableWasmPlan =
  | {
      supported: true;
      operation: "filter" | "filter-sort" | "multi-sort" | "search" | "sort";
      filters: readonly VizTableFilter[];
      search?: VizTableSearch;
      sort?: readonly VizTableSort[];
      wasmColumnsById: Map<string, WasmTableColumnRef>;
    }
  | {
      supported: false;
      reason:
        | "no-wasm-index"
        | "object-row-dataset"
        | "unsupported-column"
        | "unsupported-filter"
        | "unsupported-search"
        | "unsupported-sort"
        | "non-ascii-string"
        | "locale-string-sort"
        | "mixed-unsupported-query";
      details: Record<string, unknown>;
    };

export function planTableWasmQuery(
  query: VizTableQuery,
  schema: readonly VizTableColumnSummary[],
  wasmColumnsById: Map<string, WasmTableColumnRef>,
): VizTableWasmPlan {
  if (wasmColumnsById.size === 0) {
    return unsupported("no-wasm-index", { reason: "no-wasm-columns" });
  }

  const schemaById = new Map(schema.map((column) => [column.id, column]));
  const filters = query.filters ?? [];
  const sort = query.sort ?? [];

  for (const filter of filters) {
    const column = schemaById.get(filter.columnId);
    const wasmColumn = wasmColumnsById.get(filter.columnId);
    if (!column || !wasmColumn) {
      return unsupported(missingStringWasmColumnReason(column), {
        columnId: filter.columnId,
        usage: "filter",
      });
    }

    if (!isFilterSupported(wasmColumn.kind, filter)) {
      return unsupported(
        stringFilterHasNonAsciiValue(filter) ? "non-ascii-string" : "unsupported-filter",
        {
          columnId: filter.columnId,
          operator: filter.operator,
        },
      );
    }
  }

  if (query.search?.query) {
    if (!isAsciiString(query.search.query)) {
      return unsupported("non-ascii-string", { usage: "search" });
    }

    const searchColumns = resolveSearchColumns(schema, query.search);
    if (searchColumns.length === 0) {
      return unsupported("unsupported-search", { reason: "no-searchable-columns" });
    }

    for (const column of searchColumns) {
      const wasmColumn = wasmColumnsById.get(column.id);
      if (!wasmColumn || wasmColumn.kind !== "string") {
        return unsupported(missingStringWasmColumnReason(column), {
          columnId: column.id,
          usage: "search",
        });
      }
    }
  }

  for (const sortEntry of sort) {
    const column = schemaById.get(sortEntry.columnId);
    const wasmColumn = wasmColumnsById.get(sortEntry.columnId);
    if (!column || !wasmColumn) {
      return unsupported(missingStringWasmColumnReason(column), {
        columnId: sortEntry.columnId,
        usage: "sort",
      });
    }

    if (
      wasmColumn.kind !== "numeric" &&
      wasmColumn.kind !== "boolean" &&
      wasmColumn.kind !== "string"
    ) {
      return unsupported("unsupported-sort", { columnId: sortEntry.columnId });
    }
    // JS table sorting uses localeCompare for strings. WASM only claims the
    // bytewise-compatible lowercase ASCII subset until locale ordering is shared.
    if (wasmColumn.kind === "string" && wasmColumn.supportsSort === false) {
      return unsupported("locale-string-sort", { columnId: sortEntry.columnId });
    }
  }

  if (query.search?.query) {
    return {
      supported: true,
      operation: sort.length > 1 ? "multi-sort" : sort.length === 1 ? "filter-sort" : "search",
      filters,
      search: query.search,
      sort,
      wasmColumnsById,
    };
  }

  if (filters.length > 0 && sort.length > 0) {
    return {
      supported: true,
      operation: sort.length > 1 ? "multi-sort" : "filter-sort",
      filters,
      sort,
      wasmColumnsById,
    };
  }

  if (filters.length > 0) {
    return { supported: true, operation: "filter", filters, sort, wasmColumnsById };
  }

  if (sort.length > 0) {
    return {
      supported: true,
      operation: sort.length > 1 ? "multi-sort" : "sort",
      filters,
      sort,
      wasmColumnsById,
    };
  }

  return unsupported("mixed-unsupported-query", { reason: "no-wasm-operation" });
}

function resolveSearchColumns(schema: readonly VizTableColumnSummary[], search: VizTableSearch) {
  const requested = search.columnIds ? new Set(search.columnIds) : null;
  return schema.filter((column) => column.searchable && (!requested || requested.has(column.id)));
}

function isFilterSupported(kind: WasmTableColumnRef["kind"], filter: VizTableFilter) {
  if (kind === "boolean") {
    return (
      ["equals", "notEquals", "isNull", "isNotNull"].includes(filter.operator) &&
      (filter.operator === "isNull" ||
        filter.operator === "isNotNull" ||
        typeof filter.value === "boolean")
    );
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

function stringFilterHasNonAsciiValue(filter: VizTableFilter) {
  return typeof filter.value === "string" && !isAsciiString(filter.value);
}

function missingStringWasmColumnReason(column: VizTableColumnSummary | undefined) {
  return column?.type === "string" ? "non-ascii-string" : "unsupported-column";
}

function unsupported(
  reason: Extract<VizTableWasmPlan, { supported: false }>["reason"],
  details: Record<string, unknown>,
): VizTableWasmPlan {
  return { supported: false, reason, details };
}

export function isAsciiString(value: string) {
  return /^[\x00-\x7F]*$/.test(value);
}
