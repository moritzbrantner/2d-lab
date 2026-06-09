import type { VizBackendCapabilities } from "./core";

export type VizTableCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | Record<string, unknown>
  | readonly unknown[];

export type VizTableColumnType = "boolean" | "date" | "json" | "number" | "string" | "unknown";

export type VizTableColumnDefinition = {
  filterable?: boolean;
  id: string;
  key?: string;
  label?: string;
  meta?: Record<string, unknown>;
  nullable?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  type?: VizTableColumnType;
};

export type VizTableObjectDataset<TRow = Record<string, unknown>> = {
  columns?: readonly VizTableColumnDefinition[];
  kind: "table";
  rowIdKey?: string;
  rows: readonly TRow[];
};

export type VizTableColumnarDataset = {
  columns: readonly (VizTableColumnDefinition & {
    values: Float64Array | Int32Array | readonly unknown[] | Uint32Array | Uint8Array;
    validity?: Uint8Array;
  })[];
  kind: "table";
  rowIds?: readonly string[];
};

export type VizTableDataset<TRow = Record<string, unknown>> =
  | VizTableColumnarDataset
  | VizTableObjectDataset<TRow>;

export type VizTableSort = {
  columnId: string;
  direction: "asc" | "desc";
  nulls?: "first" | "last";
};

export type VizTableFilterOperator =
  | "between"
  | "contains"
  | "endsWith"
  | "equals"
  | "gt"
  | "gte"
  | "in"
  | "isNotNull"
  | "isNull"
  | "lt"
  | "lte"
  | "notEquals"
  | "startsWith";

export type VizTableFilter = {
  caseSensitive?: boolean;
  columnId: string;
  operator: VizTableFilterOperator;
  value?: VizTableCellValue | readonly VizTableCellValue[];
};

export type VizTableSearch = {
  caseSensitive?: boolean;
  columnIds?: readonly string[];
  query: string;
};

export type VizTableQuery = {
  columnIds?: readonly string[];
  filters?: readonly VizTableFilter[];
  rowLimit?: number;
  rowOffset?: number;
  search?: VizTableSearch;
  sort?: readonly VizTableSort[];
};

export type VizTableViewport = {
  kind: "table";
  rowLimit?: number;
  rowOffset?: number;
};

export type VizTableCell = {
  columnId: string;
  value: VizTableCellValue | null;
};

export type VizTableRow = {
  cells: readonly VizTableCell[];
  rowId: string;
  sourceIndex: number;
};

export type VizTableColumnSummary = {
  filterable: boolean;
  id: string;
  label: string;
  max?: number;
  meta?: Record<string, unknown>;
  min?: number;
  nonNullCount: number;
  nullable: boolean;
  nullCount: number;
  searchable: boolean;
  sortable: boolean;
  type: VizTableColumnType;
};

export type VizTableResult = {
  columns: readonly VizTableColumnSummary[];
  rows: readonly VizTableRow[];
  summary: {
    filteredRowCount: number;
    rowCount: number;
    rowLimit: number;
    rowOffset: number;
    visibleRowCount: number;
  };
};

export type VizTypedTableColumn =
  | {
      id: string;
      type: "date" | "number";
      validity: Uint8Array;
      values: Float64Array;
    }
  | {
      id: string;
      type: "boolean";
      validity: Uint8Array;
      values: Uint8Array;
    }
  | {
      id: string;
      type: "json" | "string" | "unknown";
      validity: Uint8Array;
      values: readonly unknown[];
    };

export type VizTypedTable = {
  columns: readonly VizTableColumnSummary[];
  rowIds: readonly string[];
  sourceIndex: Uint32Array;
  summary: VizTableResult["summary"];
  typedColumns: readonly VizTypedTableColumn[];
};

export type VizTableIndex = {
  getBackendCapabilities(): VizBackendCapabilities;
  getRowById(rowId: string): VizTableRow | null;
  getRowCount(): number;
  getSchema(): readonly VizTableColumnSummary[];
  getTable(query: VizTableQuery): VizTableResult;
  getTypedTable(query: VizTableQuery): VizTypedTable;
};
