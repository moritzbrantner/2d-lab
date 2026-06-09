import {
  isFilterCompatible,
  normalizeRowLimit,
  normalizeRowOffset,
} from "../backend/js-table-index";
import { getTableIndex, getTableViewport, resolveFrameFormat } from "./utils";

import type {
  VizAnyRenderLayer,
  VizComputeFrameOptions,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizLayer,
  VizLayerId,
  VizTableColumnSummary,
  VizTableQuery,
  VizTableResult,
  VizTypedTable,
} from "../types";

type TableLayer = Extract<VizLayer, { kind: "table" }>;

export function computeTableRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: TableLayer,
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  options: VizComputeFrameOptions,
  diagnostics: VizFrameDiagnostic[],
): VizAnyRenderLayer<TProperties> | null {
  const index = getTableIndex(layerId, layer.kind, datasetRecord, diagnostics);
  const viewport = getTableViewport(options.viewport, layerId, diagnostics);
  if (!index || !viewport) {
    return null;
  }

  const query = resolveTableQuery(layer.query, viewport);
  const validation = validateTableQuery(layerId, query, index.getSchema(), diagnostics);
  if (!validation.valid) {
    return resolveFrameFormat(options) === "typed"
      ? {
          datasetId: layer.datasetId,
          kind: "table",
          layerId,
          typedTable: createEmptyTypedTable(index.getSchema(), query, index.getRowCount()),
        }
      : {
          datasetId: layer.datasetId,
          kind: "table",
          layerId,
          table: createEmptyTable(index.getSchema(), query, index.getRowCount()),
        };
  }

  if (resolveFrameFormat(options) === "typed") {
    return {
      datasetId: layer.datasetId,
      kind: "table",
      layerId,
      typedTable: index.getTypedTable(query),
    };
  }

  return {
    datasetId: layer.datasetId,
    kind: "table",
    layerId,
    table: index.getTable(query),
  };
}

export function resolveTableQuery(
  layerQuery: VizTableQuery | undefined,
  viewport: { rowLimit?: number; rowOffset?: number },
): VizTableQuery {
  return {
    ...layerQuery,
    rowLimit: normalizeRowLimit(layerQuery?.rowLimit ?? viewport.rowLimit),
    rowOffset: normalizeRowOffset(layerQuery?.rowOffset ?? viewport.rowOffset),
  };
}

function validateTableQuery(
  layerId: VizLayerId,
  query: VizTableQuery,
  schema: readonly VizTableColumnSummary[],
  diagnostics: VizFrameDiagnostic[],
) {
  const columnsById = new Map(schema.map((column) => [column.id, column]));
  let valid = true;

  for (const filter of query.filters ?? []) {
    const column = columnsById.get(filter.columnId);
    if (!column) {
      diagnostics.push({
        code: "unknown-table-column",
        layerId,
        message: `Layer ${layerId} filter references unknown table column ${filter.columnId}.`,
        severity: "warning",
      });
      valid = false;
      continue;
    }

    if (!isFilterCompatible(column.type, filter)) {
      diagnostics.push({
        code: "incompatible-table-filter",
        layerId,
        message: `Layer ${layerId} filter ${filter.operator} is incompatible with ${column.type} column ${filter.columnId}.`,
        severity: "warning",
      });
      valid = false;
    }

    if (
      filter.operator === "between" &&
      (!Array.isArray(filter.value) || filter.value.length !== 2)
    ) {
      diagnostics.push({
        code: "invalid-table-filter",
        layerId,
        message: `Layer ${layerId} between filter on ${filter.columnId} needs a two-value range.`,
        severity: "warning",
      });
      valid = false;
    }

    if (filter.operator === "in" && !Array.isArray(filter.value)) {
      diagnostics.push({
        code: "invalid-table-filter",
        layerId,
        message: `Layer ${layerId} in filter on ${filter.columnId} needs an array value.`,
        severity: "warning",
      });
      valid = false;
    }
  }

  return { valid };
}

function createEmptyTable(
  schema: readonly VizTableColumnSummary[],
  query: VizTableQuery,
  rowCount: number,
): VizTableResult {
  const columns = resolveResultColumns(schema, query.columnIds);

  return {
    columns,
    rows: [],
    summary: {
      filteredRowCount: 0,
      rowCount,
      rowLimit: normalizeRowLimit(query.rowLimit),
      rowOffset: normalizeRowOffset(query.rowOffset),
      visibleRowCount: 0,
    },
  };
}

function createEmptyTypedTable(
  schema: readonly VizTableColumnSummary[],
  query: VizTableQuery,
  rowCount: number,
): VizTypedTable {
  return {
    columns: resolveResultColumns(schema, query.columnIds),
    rowIds: [],
    sourceIndex: new Uint32Array(0),
    summary: createEmptyTable(schema, query, rowCount).summary,
    typedColumns: [],
  };
}

function resolveResultColumns(
  schema: readonly VizTableColumnSummary[],
  columnIds: readonly string[] | undefined,
) {
  if (!columnIds) {
    return schema;
  }

  const columnsById = new Map(schema.map((column) => [column.id, column]));
  return columnIds.flatMap((columnId) => {
    const column = columnsById.get(columnId);
    return column ? [column] : [];
  });
}
