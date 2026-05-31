import { VizEngineWasmDensityIndex } from "../wasm/viz-engine-wasm-bindings";

import {
  collectMetricKeys,
  createPointLookup,
  normalizeSeriesPoints,
  type NormalizedSeriesPoint,
} from "./density-utils";

import type {
  VizBinnedSeriesQuery,
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
      summary: result.summary,
    };
  }

  getHeatmap(query: VizHeatmapQuery): VizHeatmap<TProperties> {
    const result = this.index.getHeatmap(query) as RustHeatmap<TProperties>;

    return {
      cells: result.cells.map((cell) => this.mapHeatmapCell(cell)),
      summary: result.summary,
    };
  }

  getHistogram(query: VizHistogramQuery): VizHistogram<TProperties> {
    const result = this.index.getHistogram({
      ...query,
      includeEmptyBuckets: query.includeEmptyBuckets ?? true,
    }) as RustHistogram<TProperties>;

    return {
      buckets: result.buckets.map((bucket) => this.mapHistogramBucket(bucket)),
      summary: result.summary,
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
    return this.index.getSeriesBounds() ?? null;
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
