import { NumericSeriesIndex } from "@mb-rust/dense-data-wasm";

import {
  createPointLookup,
  normalizeMetrics,
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
  VizSeriesPoint,
} from "../types";

type WasmNumericSeriesIndex = InstanceType<typeof NumericSeriesIndex>;

export class WasmVizDensityIndex<
  TProperties = Record<string, unknown>,
> implements VizDensityIndex<TProperties> {
  private readonly byId: Map<string, NormalizedSeriesPoint<TProperties>>;
  private readonly bySourceIndex: Map<number, NormalizedSeriesPoint<TProperties>>;
  private readonly index: WasmNumericSeriesIndex;

  constructor(points: readonly VizSeriesPoint<TProperties>[]) {
    const normalizedPoints = normalizeSeriesPoints(points);
    const lookup = createPointLookup(normalizedPoints);

    this.byId = lookup.byId;
    this.bySourceIndex = lookup.bySourceIndex;
    this.index = new NumericSeriesIndex(
      normalizedPoints.map((point) => ({
        metrics: normalizeMetrics(point.metrics),
        sourceIndex: point.sourceIndex,
        x: point.x,
        y: point.y,
      })),
    ) as WasmNumericSeriesIndex;
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "legacy-wasm" as const,
      usesWasm: true,
    };
  }

  getBinnedSeries(query: VizBinnedSeriesQuery) {
    const result = this.index.getBinnedSeries({
      ...query,
      includeEmptyBins: query.includeEmptyBins ?? false,
    });

    return {
      bins: result.bins.map((bin) => this.mapBin(bin)),
    };
  }

  getChartSeries(query: VizDensityQuery) {
    const result = this.index.getChartSeries({
      ...query,
      includeEmptyBins: query.includeEmptyBins ?? false,
      valueMode: query.valueMode ?? "average",
    });

    return {
      bins: result.bins.map((bin) => this.mapBin(bin)),
      samples: result.samples.map((sample) => this.mapSample(sample)),
      summary: result.summary,
    };
  }

  getHeatmap(query: VizHeatmapQuery): VizHeatmap<TProperties> {
    const result = this.index.getHeatmap(query);

    return {
      cells: result.cells.map((cell) => this.mapHeatmapCell(cell)),
      summary: result.summary,
    };
  }

  getHistogram(query: VizHistogramQuery): VizHistogram<TProperties> {
    const result = this.index.getHistogram(query);

    return {
      buckets: result.buckets.map((bucket) => this.mapHistogramBucket(bucket)),
      summary: result.summary,
    };
  }

  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null {
    return this.byId.get(pointId) ?? null;
  }

  getSeriesBounds() {
    return this.index.getSeriesBounds();
  }

  private mapBin(bin: Omit<VizDensityBin<TProperties>, "firstPoint" | "lastPoint">) {
    return {
      ...bin,
      firstPoint: this.pointBySourceIndex(bin.firstPointIndex),
      lastPoint: this.pointBySourceIndex(bin.lastPointIndex),
    };
  }

  private mapSample(sample: Omit<VizDensitySample<TProperties>, "firstPoint" | "lastPoint">) {
    return {
      ...sample,
      firstPoint: this.pointBySourceIndex(sample.firstPointIndex),
      lastPoint: this.pointBySourceIndex(sample.lastPointIndex),
    };
  }

  private mapHistogramBucket(
    bucket: Omit<VizHistogramBucket<TProperties>, "firstPoint" | "lastPoint">,
  ) {
    return {
      ...bucket,
      firstPoint: this.pointBySourceIndex(bucket.firstPointIndex),
      lastPoint: this.pointBySourceIndex(bucket.lastPointIndex),
    };
  }

  private mapHeatmapCell(cell: Omit<VizHeatmapCell<TProperties>, "firstPoint" | "lastPoint">) {
    return {
      ...cell,
      firstPoint: this.pointBySourceIndex(cell.firstPointIndex),
      lastPoint: this.pointBySourceIndex(cell.lastPointIndex),
    };
  }

  private pointBySourceIndex(sourceIndex: number | null) {
    return sourceIndex === null ? null : (this.bySourceIndex.get(sourceIndex) ?? null);
  }
}
