export class FinanceDataSeriesIndex {
  constructor(input: unknown);
  free(): void;
  getBars(query: unknown): unknown;
  getBounds(): unknown;
  getTypedReturns(query: unknown): unknown;
  getDownsampledBars(query: unknown): unknown;
  getReturns(query: unknown): unknown;
  getRiskSummary(query: unknown): unknown;
}

export class GeoFlowIndex {
  constructor(flows: unknown);
  free(): void;
  getBounds(): unknown;
  getViewportFlows(query: unknown, options?: unknown): unknown;
}

export class GeoJsonIndex {
  constructor(featureCollection: unknown);
  free(): void;
  getBounds(): unknown;
  getViewportFeatures(query: unknown, options?: unknown): unknown;
}

export class GeoPointIndex {
  constructor(points: unknown, options?: unknown);
  free(): void;
  getBounds(): unknown;
  getClusterExpansionZoom(clusterId: string): number;
  getClusterLeaves(clusterId: string, limit?: number, offset?: number): unknown;
  getHeatFeatures(query: unknown, options?: unknown): unknown;
  getPointById(pointId: string): unknown;
  getViewportAggregation(query: unknown): unknown;
  nearestPoint(query: unknown): unknown;
}

export class ScalarFieldIndex {
  constructor(points: unknown, options?: unknown);
  free(): void;
  createGrid(): unknown;
  getBounds(): unknown;
  getPointCount(): number;
  getValueAtCoordinate(coordinate: unknown): unknown;
  getValueDomain(): unknown;
}

export class VizEngineWasmDensityIndex {
  constructor(input: unknown);
  static fromArrays(x: Float64Array, y: Float64Array, sourceIndices: Uint32Array, metricKeys: readonly string[], metrics: Float64Array, metricCount: number, ids: readonly string[], labels: readonly string[]): VizEngineWasmDensityIndex;
  free(): void;
  getBinnedSeries(query: unknown): unknown;
  getTypedBinnedSeries(xMin: number, xMax: number, targetBinCount: number, includeEmptyBins: boolean, valueMode: string): unknown;
  getTypedHeatmap(xMin: number, xMax: number, xBinCount: number, yBinCount: number, includeEmptyCells: boolean, yMin: number, yMax: number): unknown;
  getTypedHistogram(bucketCount: number, includeEmptyBuckets: boolean, xMin: number, xMax: number, valueMin: number, valueMax: number): unknown;
  getTypedRollingSeries(xMin: number, xMax: number, windowSize: number, minPeriods: number, alpha: number, statistic: string): unknown;
  getHeatmap(query: unknown): unknown;
  getHistogram(query: unknown): unknown;
  getRollingSeries(query: unknown): unknown;
  getSeriesBounds(): unknown;
  hitTestX(query: unknown): unknown;
}

export class VizEngineWasmTableIndex {
  constructor();
  addAsciiStringColumn(values: readonly (string | null)[], validity?: Uint8Array): number;
  addBooleanColumn(values: Uint8Array, validity?: Uint8Array): number;
  addNumericColumn(columnType: string, values: Float64Array, validity?: Uint8Array): number;
  free(): void;
  queryBoolean(columnIndex: number, operator: string, value?: boolean, rowOffset?: number, rowLimit?: number): unknown;
  queryNumeric(query: unknown): unknown;
  queryStringFilter(columnIndex: number, operator: string, value?: string, caseSensitive?: boolean, rowOffset?: number, rowLimit?: number): unknown;
  queryStringSearch(columnIndices: readonly number[], query: string, caseSensitive?: boolean, rowOffset?: number, rowLimit?: number): unknown;
  sortBoolean(columnIndex: number, direction: string, nulls: string, rowOffset?: number, rowLimit?: number): unknown;
  sortNumeric(columnIndex: number, direction: string, nulls: string, rowOffset?: number, rowLimit?: number): unknown;
}

export function initVizEngineWasm(): WebAssembly.Exports;
