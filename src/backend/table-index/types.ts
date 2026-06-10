import type {
  VizTableCellValue,
  VizTableColumnDefinition,
  VizTableColumnSummary,
} from "../../types";

export type NormalizedColumn = {
  definition: VizTableColumnDefinition;
  summary: VizTableColumnSummary;
  values: Array<VizTableCellValue | null>;
};

export type NormalizedTableDataset = {
  columns: NormalizedColumn[];
  rowCount: number;
  rowIds: string[];
};

export type QueryResult = {
  columnIds: string[];
  filteredRowCount: number;
  rowIndices: number[];
  rowLimit: number;
  rowOffset: number;
};
