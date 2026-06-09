export type VizDatasetId = string;
export type VizLayerId = string;

export type VizBackendOption = "auto" | "js" | "wasm";
export type VizBackendConfig = {
  finance?: VizBackendOption;
  geo?: VizBackendOption;
  table?: VizBackendOption;
  xy?: VizBackendOption;
};
export type VizResolvedBackend = "js" | "mixed" | "wasm";
export type VizBackendImplementation =
  | "js"
  | "legacy-wasm"
  | "mixed"
  | "rust-finance-data-wasm"
  | "rust-geo-viz-wasm"
  | "rust-viz-engine-wasm";

export type VizMetricRecord = Record<string, number>;
export type VizPercentileMode = "p10" | "p25" | "p50" | "p75" | "p90" | "p95" | "p99";
export type VizRollingStatistic = "ema" | "max" | "mean" | "min" | "stdDev" | "zScore";
export type VizValueMode = "average" | "count" | "max" | "min" | "sum" | VizPercentileMode;
export type VizPointValueAccessor = "x" | "y" | { metric: string };
export type VizGeoBounds = [west: number, south: number, east: number, north: number];
export type VizRenderBounds = [number, number, number, number];

export type VizSeriesPoint<TProperties = Record<string, unknown>> = {
  id?: string;
  label?: string;
  metrics?: VizMetricRecord;
  properties?: TProperties;
  x: number;
  y: number;
};

export type VizXyObjectDataset<TProperties = Record<string, unknown>> = {
  kind: "xy";
  points: readonly VizSeriesPoint<TProperties>[];
};

export type VizXyTypedDataset = {
  ids?: readonly string[];
  kind: "xy";
  labels?: readonly string[];
  metricKeys?: readonly string[];
  metrics?: Float64Array;
  sourceIndices?: Uint32Array;
  x: Float64Array;
  y: Float64Array;
};

export type VizXyDataset<TProperties = Record<string, unknown>> =
  | VizXyObjectDataset<TProperties>
  | VizXyTypedDataset;

export type VizIndexedSeriesPoint<TProperties = Record<string, unknown>> =
  VizSeriesPoint<TProperties> & {
    sourceIndex: number;
  };

export type VizDensityBin<TProperties = Record<string, unknown>> = {
  averageY: number | null;
  firstPoint: VizIndexedSeriesPoint<TProperties> | null;
  firstPointIndex: number | null;
  index: number;
  lastPoint: VizIndexedSeriesPoint<TProperties> | null;
  lastPointIndex: number | null;
  maxY: number | null;
  metrics: VizMetricRecord;
  minY: number | null;
  p10?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  p95?: number | null;
  p99?: number | null;
  pointCount: number;
  sumY: number;
  x0: number;
  x1: number;
};

export type VizDensitySample<TProperties = Record<string, unknown>> = VizDensityBin<TProperties> & {
  x: number;
  y: number | null;
};

export type VizDensitySeries<TProperties = Record<string, unknown>> = {
  bins: Array<VizDensityBin<TProperties>>;
  samples: Array<VizDensitySample<TProperties>>;
  summary: {
    binCount: number;
    metrics: VizMetricRecord;
    pointCount: number;
    sampleCount: number;
    valueMode: VizValueMode;
    xDomain: [number, number];
  };
};

export type VizCompactMetricArrays = Record<string, Float64Array>;

export type VizCompactDensitySeries = {
  averageY: Float64Array;
  firstPointIndex: Int32Array;
  lastPointIndex: Int32Array;
  maxY: Float64Array;
  metrics?: VizCompactMetricArrays;
  minY: Float64Array;
  pointCount: Uint32Array;
  sumY: Float64Array;
  x0: Float64Array;
  x1: Float64Array;
  y: Float64Array;
  summary: {
    binCount: number;
    metricKeys: string[];
    pointCount: number;
    sampleCount: number;
    valueMode: VizValueMode;
    xDomain: [number, number];
  };
};

export type VizHistogramBucket<TProperties = Record<string, unknown>> = {
  averageValue: number | null;
  firstPoint: VizIndexedSeriesPoint<TProperties> | null;
  firstPointIndex: number | null;
  index: number;
  lastPoint: VizIndexedSeriesPoint<TProperties> | null;
  lastPointIndex: number | null;
  maxValue: number | null;
  metrics: VizMetricRecord;
  minValue: number | null;
  pointCount: number;
  sumValue: number;
  value: number;
  value0: number;
  value1: number;
};

export type VizHistogram<TProperties = Record<string, unknown>> = {
  buckets: Array<VizHistogramBucket<TProperties>>;
  summary: {
    bucketCount: number;
    metrics: VizMetricRecord;
    pointCount: number;
    valueDomain: [number, number];
    xDomain: [number, number] | null;
  };
};

export type VizCompactHistogram = {
  averageValue: Float64Array;
  firstPointIndex: Int32Array;
  lastPointIndex: Int32Array;
  maxValue: Float64Array;
  metrics?: VizCompactMetricArrays;
  minValue: Float64Array;
  pointCount: Uint32Array;
  sumValue: Float64Array;
  value: Float64Array;
  value0: Float64Array;
  value1: Float64Array;
  summary: {
    bucketCount: number;
    metricKeys: string[];
    pointCount: number;
    valueDomain: [number, number];
    xDomain: [number, number] | null;
  };
};

export type VizHeatmapCell<TProperties = Record<string, unknown>> = {
  averageValue: number | null;
  firstPoint: VizIndexedSeriesPoint<TProperties> | null;
  firstPointIndex: number | null;
  index: number;
  lastPoint: VizIndexedSeriesPoint<TProperties> | null;
  lastPointIndex: number | null;
  metrics: VizMetricRecord;
  pointCount: number;
  sumValue: number;
  value: number;
  x: number;
  x0: number;
  x1: number;
  xIndex: number;
  y: number;
  y0: number;
  y1: number;
  yIndex: number;
};

export type VizHeatmap<TProperties = Record<string, unknown>> = {
  cells: Array<VizHeatmapCell<TProperties>>;
  summary: {
    maxCellCount: number;
    metrics: VizMetricRecord;
    pointCount: number;
    xBinCount: number;
    xDomain: [number, number];
    yBinCount: number;
    yDomain: [number, number];
  };
};

export type VizCompactHeatmap = {
  averageValue: Float64Array;
  firstPointIndex: Int32Array;
  format?: "dense" | "sparse";
  lastPointIndex: Int32Array;
  metrics?: VizCompactMetricArrays;
  pointCount: Uint32Array;
  sumValue: Float64Array;
  value: Float64Array;
  xIndex: Uint32Array;
  yIndex: Uint32Array;
  summary: {
    maxCellCount: number;
    metricKeys: string[];
    pointCount: number;
    xBinCount: number;
    xDomain: [number, number];
    yBinCount: number;
    yDomain: [number, number];
  };
};

export type VizRollingSeriesPoint<TProperties = Record<string, unknown>> = {
  ema: number | null;
  index: number;
  max: number | null;
  mean: number | null;
  min: number | null;
  pointCount: number;
  sourcePoint: VizIndexedSeriesPoint<TProperties> | null;
  sourcePointIndex: number | null;
  statistic: VizRollingStatistic;
  stdDev: number | null;
  sum: number | null;
  windowSize: number;
  x: number;
  y: number | null;
  zScore: number | null;
};

export type VizRollingSeries<TProperties = Record<string, unknown>> = {
  points: Array<VizRollingSeriesPoint<TProperties>>;
  summary: {
    alpha: number;
    minPeriods: number;
    pointCount: number;
    sampleCount: number;
    statistic: VizRollingStatistic;
    windowSize: number;
    xDomain: [number, number];
  };
};

export type VizCompactRollingSeries = {
  ema: Float64Array;
  max: Float64Array;
  mean: Float64Array;
  min: Float64Array;
  pointCount: Uint32Array;
  sourcePointIndex: Int32Array;
  stdDev: Float64Array;
  sum: Float64Array;
  x: Float64Array;
  y: Float64Array;
  zScore: Float64Array;
  summary: VizRollingSeries["summary"];
};

export type VizDensityQuery = {
  includeEmptyBins?: boolean;
  percentiles?: readonly VizPercentileMode[];
  targetBinCount: number;
  valueMode?: VizValueMode;
  xDomain: [number, number];
};

export type VizBinnedSeriesQuery = {
  includeEmptyBins?: boolean;
  targetBinCount: number;
  xDomain: [number, number];
};

export type VizHistogramQuery = {
  bucketCount: number;
  includeEmptyBuckets?: boolean;
  valueAccessor?: VizPointValueAccessor;
  valueDomain?: [number, number];
  xDomain?: [number, number];
};

export type VizHeatmapQuery = {
  includeEmptyCells?: boolean;
  valueAccessor?: VizPointValueAccessor;
  xBinCount: number;
  xDomain: [number, number];
  yBinCount: number;
  yDomain?: [number, number];
};

export type VizRollingSeriesQuery = {
  alpha?: number;
  minPeriods?: number;
  statistic?: VizRollingStatistic;
  windowSize: number;
  xDomain: [number, number];
};

export type VizSeriesBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

export type VizBackendCapabilities = {
  backend: Exclude<VizResolvedBackend, "mixed">;
  implementation?: Exclude<VizBackendImplementation, "mixed">;
  usesWasm: boolean;
};

export type VizDensityIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): VizBackendCapabilities;
  getBinnedSeries(query: VizBinnedSeriesQuery): { bins: Array<VizDensityBin<TProperties>> };
  /** @deprecated Use getCompactChartSeries for render workloads, or hydrate typed frames for debugging. */
  getChartSeries(query: VizDensityQuery): VizDensitySeries<TProperties>;
  getCompactChartSeries(query: VizDensityQuery): VizCompactDensitySeries;
  getCompactHeatmap(query: VizHeatmapQuery): VizCompactHeatmap;
  getCompactHistogram(query: VizHistogramQuery): VizCompactHistogram;
  getCompactRollingSeries(query: VizRollingSeriesQuery): VizCompactRollingSeries;
  /** @deprecated Use getCompactHeatmap for render workloads, or hydrate typed frames for debugging. */
  getHeatmap(query: VizHeatmapQuery): VizHeatmap<TProperties>;
  /** @deprecated Use getCompactHistogram for render workloads, or hydrate typed frames for debugging. */
  getHistogram(query: VizHistogramQuery): VizHistogram<TProperties>;
  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null;
  preferCompactBackend?(context: {
    layerKind: "binned-series" | "heatmap" | "histogram" | "rolling-series";
    pointCount?: number;
  }): void;
  /** @deprecated Use getCompactRollingSeries for render workloads, or hydrate typed frames for debugging. */
  getRollingSeries(query: VizRollingSeriesQuery): VizRollingSeries<TProperties>;
  getSeriesBounds(): VizSeriesBounds | null;
};
