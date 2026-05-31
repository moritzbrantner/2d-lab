import { initVizEngineWasm, VizEngineWasmDensityIndex } from "../wasm/viz-engine-wasm-bindings";

import {
  collectMetricKeys,
  createPointLookup,
  normalizeSeriesPoints,
  type NormalizedSeriesPoint,
} from "./density-utils";

import type {
  VizBinnedSeriesQuery,
  VizCompactDensitySeries,
  VizCompactHeatmap,
  VizCompactHistogram,
  VizCompactMetricArrays,
  VizCompactRollingSeries,
  VizDensityBin,
  VizDensityIndex,
  VizDensityQuery,
  VizDensitySample,
  VizHeatmap,
  VizHeatmapCell,
  VizHeatmapQuery,
  VizHistogram,
  VizHistogramBucket,
  VizHistogramQuery,
  VizIndexedSeriesPoint,
  VizMetricRecord,
  VizRollingSeries,
  VizRollingSeriesPoint,
  VizRollingSeriesQuery,
  VizSeriesPoint,
} from "../types";

type RustWasmDensityIndex = InstanceType<typeof VizEngineWasmDensityIndex>;
type RustResult<T> = Omit<T, "firstPoint" | "lastPoint">;
type RustDensitySeries<TProperties> = {
  bins: Array<RustResult<VizDensityBin<TProperties>>>;
  samples: Array<RustResult<VizDensitySample<TProperties>>>;
  summary: ReturnType<VizDensityIndex<TProperties>["getChartSeries"]>["summary"];
};
type RustHeatmap<TProperties> = {
  cells: Array<RustResult<VizHeatmapCell<TProperties>>>;
  summary: VizHeatmap<TProperties>["summary"];
};
type RustHistogram<TProperties> = {
  buckets: Array<RustResult<VizHistogramBucket<TProperties>>>;
  summary: VizHistogram<TProperties>["summary"];
};
type RustRollingSeries<TProperties> = {
  points: Array<Omit<VizRollingSeriesPoint<TProperties>, "sourcePoint">>;
  summary: VizRollingSeries<TProperties>["summary"];
};

export class RustWasmVizDensityIndex<
  TProperties = Record<string, unknown>,
> implements VizDensityIndex<TProperties> {
  private readonly byId: Map<string, NormalizedSeriesPoint<TProperties>>;
  private readonly bySourceIndex: Map<number, NormalizedSeriesPoint<TProperties>>;
  private readonly index: RustWasmDensityIndex;

  constructor(points: readonly VizSeriesPoint<TProperties>[]) {
    initVizEngineWasm();

    const normalizedPoints = normalizeSeriesPoints(points);
    const metricKeys = collectMetricKeys(normalizedPoints);
    const lookup = createPointLookup(normalizedPoints);

    this.byId = lookup.byId;
    this.bySourceIndex = lookup.bySourceIndex;
    this.index = new VizEngineWasmDensityIndex({
      ids: normalizedPoints.map((point) => point.id ?? ""),
      labels: normalizedPoints.map((point) => point.label ?? ""),
      metricKeys,
      metrics: normalizedPoints.map((point) => metricValues(point.metrics, metricKeys)),
      sourceIndices: normalizedPoints.map((point) => point.sourceIndex),
      x: normalizedPoints.map((point) => point.x),
      y: normalizedPoints.map((point) => point.y),
    }) as RustWasmDensityIndex;
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "rust-viz-engine-wasm" as const,
      usesWasm: true,
    };
  }

  getBinnedSeries(query: VizBinnedSeriesQuery) {
    const result = this.index.getBinnedSeries({
      ...query,
      includeEmptyBins: query.includeEmptyBins ?? false,
      valueMode: "average",
    }) as RustDensitySeries<TProperties>;

    return {
      bins: result.bins.map((bin) => this.mapBin(bin)),
    };
  }

  getChartSeries(query: VizDensityQuery) {
    const result = this.index.getBinnedSeries({
      ...query,
      includeEmptyBins: query.includeEmptyBins ?? false,
      valueMode: query.valueMode ?? "average",
    }) as RustDensitySeries<TProperties>;

    return {
      bins: result.bins.map((bin) => this.mapBin(bin)),
      samples: result.samples.map((sample) => this.mapSample(sample)),
      summary: this.mapDensitySummary(result.summary),
    };
  }

  getCompactChartSeries(query: VizDensityQuery): VizCompactDensitySeries {
    const valueMode = query.valueMode ?? "average";
    const compact = getOptionalWasmMethod(this.index, "getCompactChartSeries");
    if (compact) {
      return normalizeCompactDensitySeries(
        compact(
          query.xDomain[0],
          query.xDomain[1],
          query.targetBinCount,
          query.includeEmptyBins ?? false,
          valueMode,
        ) as VizCompactDensitySeries,
        valueMode,
        query.xDomain,
      );
    }

    return compactDensityFromSeries(this.getChartSeries(query));
  }

  getCompactHeatmap(query: VizHeatmapQuery): VizCompactHeatmap {
    const compact = getOptionalWasmMethod(this.index, "getCompactHeatmap");
    if (compact && (query.valueAccessor == null || query.valueAccessor === "y")) {
      return normalizeCompactHeatmap(
        compact(
          query.xDomain[0],
          query.xDomain[1],
          query.xBinCount,
          query.yBinCount,
          query.includeEmptyCells ?? false,
          query.yDomain?.[0] ?? Number.NaN,
          query.yDomain?.[1] ?? Number.NaN,
        ) as VizCompactHeatmap,
        query,
      );
    }

    return compactHeatmapFromHeatmap(this.getHeatmap(query));
  }

  getCompactHistogram(query: VizHistogramQuery): VizCompactHistogram {
    const compact = getOptionalWasmMethod(this.index, "getCompactHistogram");
    if (compact && (query.valueAccessor == null || query.valueAccessor === "y")) {
      return normalizeCompactHistogram(
        compact(
          query.bucketCount,
          query.includeEmptyBuckets ?? true,
          query.xDomain?.[0] ?? Number.NaN,
          query.xDomain?.[1] ?? Number.NaN,
          query.valueDomain?.[0] ?? Number.NaN,
          query.valueDomain?.[1] ?? Number.NaN,
        ) as VizCompactHistogram,
        query,
      );
    }

    return compactHistogramFromHistogram(this.getHistogram(query));
  }

  getCompactRollingSeries(query: VizRollingSeriesQuery): VizCompactRollingSeries {
    const compact = getOptionalWasmMethod(this.index, "getCompactRollingSeries");
    const statistic = query.statistic ?? "mean";
    if (compact) {
      return normalizeCompactRollingSeries(
        compact(
          query.xDomain[0],
          query.xDomain[1],
          query.windowSize,
          query.minPeriods ?? 0,
          query.alpha ?? Number.NaN,
          statistic,
        ) as VizCompactRollingSeries,
        query,
      );
    }

    return compactRollingFromSeries(this.getRollingSeries(query));
  }

  getHeatmap(query: VizHeatmapQuery): VizHeatmap<TProperties> {
    const result = this.index.getHeatmap(query) as RustHeatmap<TProperties>;

    return {
      cells: result.cells.map((cell) => this.mapHeatmapCell(cell)),
      summary: {
        ...result.summary,
        metrics: normalizeRustMetrics(result.summary.metrics),
      },
    };
  }

  getHistogram(query: VizHistogramQuery): VizHistogram<TProperties> {
    const result = this.index.getHistogram({
      ...query,
      includeEmptyBuckets: query.includeEmptyBuckets ?? true,
    }) as RustHistogram<TProperties>;

    return {
      buckets: result.buckets.map((bucket) => this.mapHistogramBucket(bucket)),
      summary: {
        ...result.summary,
        metrics: normalizeRustMetrics(result.summary.metrics),
      },
    };
  }

  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null {
    return this.byId.get(pointId) ?? null;
  }

  getRollingSeries(query: VizRollingSeriesQuery): VizRollingSeries<TProperties> {
    const result = this.index.getRollingSeries({
      ...query,
      statistic: query.statistic ?? "mean",
    }) as RustRollingSeries<TProperties>;

    return {
      points: result.points.map((point) => this.mapRollingPoint(point)),
      summary: result.summary,
    };
  }

  getSeriesBounds() {
    return (
      (this.index.getSeriesBounds() as ReturnType<
        VizDensityIndex<TProperties>["getSeriesBounds"]
      >) ?? null
    );
  }

  hitTestX(query: VizDensityQuery & { x: number }) {
    return this.index.hitTestX({
      targetBinCount: query.targetBinCount,
      valueMode: query.valueMode ?? "average",
      x: query.x,
      xDomain: query.xDomain,
    });
  }

  private mapBin(bin: RustResult<VizDensityBin<TProperties>>) {
    return {
      ...bin,
      averageY: bin.averageY ?? null,
      firstPoint: this.pointBySourceIndex(bin.firstPointIndex),
      firstPointIndex: bin.firstPointIndex ?? null,
      lastPoint: this.pointBySourceIndex(bin.lastPointIndex),
      lastPointIndex: bin.lastPointIndex ?? null,
      maxY: bin.maxY ?? null,
      metrics: normalizeRustMetrics(bin.metrics),
      minY: bin.minY ?? null,
    };
  }

  private mapSample(sample: RustResult<VizDensitySample<TProperties>>) {
    return {
      ...sample,
      averageY: sample.averageY ?? null,
      firstPoint: this.pointBySourceIndex(sample.firstPointIndex),
      firstPointIndex: sample.firstPointIndex ?? null,
      lastPoint: this.pointBySourceIndex(sample.lastPointIndex),
      lastPointIndex: sample.lastPointIndex ?? null,
      maxY: sample.maxY ?? null,
      metrics: normalizeRustMetrics(sample.metrics),
      minY: sample.minY ?? null,
      y: sample.y ?? null,
    };
  }

  private mapDensitySummary(summary: RustDensitySeries<TProperties>["summary"]) {
    return {
      ...summary,
      metrics: normalizeRustMetrics(summary.metrics),
    };
  }

  private mapHistogramBucket(bucket: RustResult<VizHistogramBucket<TProperties>>) {
    return {
      ...bucket,
      averageValue: bucket.averageValue ?? null,
      firstPoint: this.pointBySourceIndex(bucket.firstPointIndex),
      firstPointIndex: bucket.firstPointIndex ?? null,
      lastPoint: this.pointBySourceIndex(bucket.lastPointIndex),
      lastPointIndex: bucket.lastPointIndex ?? null,
      maxValue: bucket.maxValue ?? null,
      metrics: normalizeRustMetrics(bucket.metrics),
      minValue: bucket.minValue ?? null,
    };
  }

  private mapHeatmapCell(cell: RustResult<VizHeatmapCell<TProperties>>) {
    return {
      ...cell,
      averageValue: cell.averageValue ?? null,
      firstPoint: this.pointBySourceIndex(cell.firstPointIndex),
      firstPointIndex: cell.firstPointIndex ?? null,
      lastPoint: this.pointBySourceIndex(cell.lastPointIndex),
      lastPointIndex: cell.lastPointIndex ?? null,
      metrics: normalizeRustMetrics(cell.metrics),
    };
  }

  private mapRollingPoint(point: Omit<VizRollingSeriesPoint<TProperties>, "sourcePoint">) {
    return {
      ...point,
      ema: point.ema ?? null,
      max: point.max ?? null,
      mean: point.mean ?? null,
      min: point.min ?? null,
      sourcePoint: this.pointBySourceIndex(point.sourcePointIndex),
      sourcePointIndex: point.sourcePointIndex ?? null,
      stdDev: point.stdDev ?? null,
      sum: point.sum ?? null,
      y: point.y ?? null,
      zScore: point.zScore ?? null,
    };
  }

  private pointBySourceIndex(sourceIndex: number | null | undefined) {
    return sourceIndex == null ? null : (this.bySourceIndex.get(sourceIndex) ?? null);
  }
}

function metricValues(metrics: VizMetricRecord | undefined, metricKeys: readonly string[]) {
  return metricKeys.map((key) => metrics?.[key] ?? 0);
}

function normalizeRustMetrics(metrics: VizMetricRecord | Map<string, number>): VizMetricRecord {
  return metrics instanceof Map ? Object.fromEntries(metrics) : metrics;
}

function getOptionalWasmMethod<T extends (...args: unknown[]) => unknown>(
  index: RustWasmDensityIndex,
  name: string,
): T | null {
  const method = (index as unknown as Record<string, unknown>)[name];
  return typeof method === "function" ? (method.bind(index) as T) : null;
}

function normalizeCompactDensitySeries(
  compact: VizCompactDensitySeries,
  valueMode: VizDensityQuery["valueMode"],
  xDomain: [number, number],
): VizCompactDensitySeries {
  return {
    ...compact,
    metrics: normalizeCompactMetrics(compact.metrics),
    summary: {
      ...compact.summary,
      valueMode: valueMode ?? compact.summary.valueMode ?? "average",
      xDomain: compact.summary.xDomain ?? xDomain,
    },
  };
}

function normalizeCompactHeatmap(
  compact: VizCompactHeatmap,
  query: VizHeatmapQuery,
): VizCompactHeatmap {
  return {
    ...compact,
    metrics: normalizeCompactMetrics(compact.metrics),
    summary: {
      ...compact.summary,
      xDomain: compact.summary.xDomain ?? query.xDomain,
    },
  };
}

function normalizeCompactHistogram(
  compact: VizCompactHistogram,
  query: VizHistogramQuery,
): VizCompactHistogram {
  return {
    ...compact,
    metrics: normalizeCompactMetrics(compact.metrics),
    summary: {
      ...compact.summary,
      xDomain: compact.summary.xDomain ?? query.xDomain ?? null,
    },
  };
}

function normalizeCompactRollingSeries(
  compact: VizCompactRollingSeries,
  query: VizRollingSeriesQuery,
): VizCompactRollingSeries {
  return {
    ...compact,
    summary: {
      ...compact.summary,
      statistic: query.statistic ?? compact.summary.statistic ?? "mean",
      xDomain: compact.summary.xDomain ?? query.xDomain,
    },
  };
}

function normalizeCompactMetrics(
  metrics: VizCompactMetricArrays | Map<string, Float64Array> | undefined,
) {
  return metrics instanceof Map ? Object.fromEntries(metrics) : metrics;
}

function compactDensityFromSeries<TProperties>(
  series: ReturnType<VizDensityIndex<TProperties>["getChartSeries"]>,
): VizCompactDensitySeries {
  const length = series.samples.length;
  const output = createCompactDensityArrays(length);
  const metricKeys = Object.keys(series.summary.metrics);
  const metrics = createMetricArrays(metricKeys, length);

  for (const [index, sample] of series.samples.entries()) {
    output.averageY[index] = sample.averageY ?? Number.NaN;
    output.firstPointIndex[index] = sample.firstPointIndex ?? -1;
    output.lastPointIndex[index] = sample.lastPointIndex ?? -1;
    output.maxY[index] = sample.maxY ?? Number.NaN;
    output.minY[index] = sample.minY ?? Number.NaN;
    output.pointCount[index] = sample.pointCount;
    output.sumY[index] = sample.sumY;
    output.x0[index] = sample.x0;
    output.x1[index] = sample.x1;
    output.y[index] = sample.y ?? Number.NaN;
    for (const metricKey of metricKeys) {
      metrics[metricKey]![index] = sample.metrics[metricKey] ?? 0;
    }
  }

  return {
    ...output,
    metrics,
    summary: {
      binCount: series.summary.binCount,
      metricKeys,
      pointCount: series.summary.pointCount,
      sampleCount: series.summary.sampleCount,
      valueMode: series.summary.valueMode,
      xDomain: series.summary.xDomain,
    },
  };
}

function compactHeatmapFromHeatmap<TProperties>(
  heatmap: VizHeatmap<TProperties>,
): VizCompactHeatmap {
  const length = heatmap.cells.length;
  const output = createCompactHeatmapArrays(length);
  const metricKeys = Object.keys(heatmap.summary.metrics);
  const metrics = createMetricArrays(metricKeys, length);

  for (const [index, cell] of heatmap.cells.entries()) {
    output.averageValue[index] = cell.averageValue ?? Number.NaN;
    output.firstPointIndex[index] = cell.firstPointIndex ?? -1;
    output.lastPointIndex[index] = cell.lastPointIndex ?? -1;
    output.pointCount[index] = cell.pointCount;
    output.sumValue[index] = cell.sumValue;
    output.value[index] = cell.value;
    output.xIndex[index] = cell.xIndex;
    output.yIndex[index] = cell.yIndex;
    for (const metricKey of metricKeys) {
      metrics[metricKey]![index] = cell.metrics[metricKey] ?? 0;
    }
  }

  return {
    ...output,
    metrics,
    summary: {
      ...heatmap.summary,
      metricKeys,
    },
  };
}

function compactHistogramFromHistogram<TProperties>(
  histogram: VizHistogram<TProperties>,
): VizCompactHistogram {
  const length = histogram.buckets.length;
  const output = createCompactHistogramArrays(length);
  const metricKeys = Object.keys(histogram.summary.metrics);
  const metrics = createMetricArrays(metricKeys, length);

  for (const [index, bucket] of histogram.buckets.entries()) {
    output.averageValue[index] = bucket.averageValue ?? Number.NaN;
    output.firstPointIndex[index] = bucket.firstPointIndex ?? -1;
    output.lastPointIndex[index] = bucket.lastPointIndex ?? -1;
    output.maxValue[index] = bucket.maxValue ?? Number.NaN;
    output.minValue[index] = bucket.minValue ?? Number.NaN;
    output.pointCount[index] = bucket.pointCount;
    output.sumValue[index] = bucket.sumValue;
    output.value[index] = bucket.value;
    output.value0[index] = bucket.value0;
    output.value1[index] = bucket.value1;
    for (const metricKey of metricKeys) {
      metrics[metricKey]![index] = bucket.metrics[metricKey] ?? 0;
    }
  }

  return {
    ...output,
    metrics,
    summary: {
      ...histogram.summary,
      metricKeys,
    },
  };
}

function compactRollingFromSeries<TProperties>(
  series: VizRollingSeries<TProperties>,
): VizCompactRollingSeries {
  const length = series.points.length;
  const output = createCompactRollingArrays(length);

  for (const [index, point] of series.points.entries()) {
    output.ema[index] = point.ema ?? Number.NaN;
    output.max[index] = point.max ?? Number.NaN;
    output.mean[index] = point.mean ?? Number.NaN;
    output.min[index] = point.min ?? Number.NaN;
    output.pointCount[index] = point.pointCount;
    output.sourcePointIndex[index] = point.sourcePointIndex ?? -1;
    output.stdDev[index] = point.stdDev ?? Number.NaN;
    output.sum[index] = point.sum ?? Number.NaN;
    output.x[index] = point.x;
    output.y[index] = point.y ?? Number.NaN;
    output.zScore[index] = point.zScore ?? Number.NaN;
  }

  return {
    ...output,
    summary: series.summary,
  };
}

function createCompactDensityArrays(length: number) {
  return {
    averageY: filledFloat64Array(length, Number.NaN),
    firstPointIndex: filledInt32Array(length, -1),
    lastPointIndex: filledInt32Array(length, -1),
    maxY: filledFloat64Array(length, Number.NaN),
    minY: filledFloat64Array(length, Number.NaN),
    pointCount: new Uint32Array(length),
    sumY: new Float64Array(length),
    x0: new Float64Array(length),
    x1: new Float64Array(length),
    y: filledFloat64Array(length, Number.NaN),
  };
}

function createCompactHeatmapArrays(length: number) {
  return {
    averageValue: filledFloat64Array(length, Number.NaN),
    firstPointIndex: filledInt32Array(length, -1),
    lastPointIndex: filledInt32Array(length, -1),
    pointCount: new Uint32Array(length),
    sumValue: new Float64Array(length),
    value: new Float64Array(length),
    xIndex: new Uint32Array(length),
    yIndex: new Uint32Array(length),
  };
}

function createCompactHistogramArrays(length: number) {
  return {
    averageValue: filledFloat64Array(length, Number.NaN),
    firstPointIndex: filledInt32Array(length, -1),
    lastPointIndex: filledInt32Array(length, -1),
    maxValue: filledFloat64Array(length, Number.NaN),
    minValue: filledFloat64Array(length, Number.NaN),
    pointCount: new Uint32Array(length),
    sumValue: new Float64Array(length),
    value: new Float64Array(length),
    value0: new Float64Array(length),
    value1: new Float64Array(length),
  };
}

function createCompactRollingArrays(length: number) {
  return {
    ema: filledFloat64Array(length, Number.NaN),
    max: filledFloat64Array(length, Number.NaN),
    mean: filledFloat64Array(length, Number.NaN),
    min: filledFloat64Array(length, Number.NaN),
    pointCount: new Uint32Array(length),
    sourcePointIndex: filledInt32Array(length, -1),
    stdDev: filledFloat64Array(length, Number.NaN),
    sum: filledFloat64Array(length, Number.NaN),
    x: new Float64Array(length),
    y: filledFloat64Array(length, Number.NaN),
    zScore: filledFloat64Array(length, Number.NaN),
  };
}

function createMetricArrays(metricKeys: readonly string[], length: number): VizCompactMetricArrays {
  const arrays: VizCompactMetricArrays = {};
  for (const metricKey of metricKeys) {
    arrays[metricKey] = new Float64Array(length);
  }
  return arrays;
}

function filledFloat64Array(length: number, value: number) {
  const array = new Float64Array(length);
  array.fill(value);
  return array;
}

function filledInt32Array(length: number, value: number) {
  const array = new Int32Array(length);
  array.fill(value);
  return array;
}
