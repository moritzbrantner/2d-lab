import {
  collectMetricKeys,
  createBins,
  createChartSeries,
  createTypedBinnedSeries,
  createTypedHeatmap,
  createTypedHistogram,
  createTypedRollingSeries,
  createHeatmap,
  createHistogram,
  createPointLookup,
  createRollingSeries,
  getSeriesBounds,
  normalizeSeriesInput,
  type NormalizedSeriesPoint,
} from "./density-utils";

import type {
  VizBinnedSeriesQuery,
  VizDensityIndex,
  VizDensityQuery,
  VizHeatmapQuery,
  VizHistogramQuery,
  VizIndexedSeriesPoint,
  VizRollingSeriesQuery,
  VizSeriesPoint,
  VizXyDataset,
} from "../types";

export class JsVizDensityIndex<
  TProperties = Record<string, unknown>,
> implements VizDensityIndex<TProperties> {
  private readonly byId: Map<string, NormalizedSeriesPoint<TProperties>>;
  private readonly metricKeys: string[];
  private readonly points: Array<NormalizedSeriesPoint<TProperties>>;

  constructor(points: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>) {
    this.points = normalizeSeriesInput<TProperties>(points);
    this.metricKeys = collectMetricKeys(this.points);
    this.byId = createPointLookup(this.points).byId;
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }

  getBinnedSeries(query: VizBinnedSeriesQuery) {
    return {
      bins: createBins(this.points, this.metricKeys, {
        ...query,
        includeEmptyBins: query.includeEmptyBins ?? false,
      }),
    };
  }

  getChartSeries(query: VizDensityQuery) {
    return createChartSeries(this.points, this.metricKeys, {
      ...query,
      includeEmptyBins: query.includeEmptyBins ?? false,
    });
  }

  getTypedBinnedSeries(query: VizDensityQuery) {
    return createTypedBinnedSeries(this.points, this.metricKeys, {
      ...query,
      includeEmptyBins: query.includeEmptyBins ?? false,
    });
  }

  getTypedHeatmap(query: VizHeatmapQuery) {
    return createTypedHeatmap(this.points, this.metricKeys, query);
  }

  getTypedHistogram(query: VizHistogramQuery) {
    return createTypedHistogram(this.points, this.metricKeys, query);
  }

  getTypedRollingSeries(query: VizRollingSeriesQuery) {
    return createTypedRollingSeries(this.points, {
      ...query,
      statistic: query.statistic ?? "mean",
    });
  }

  getHeatmap(query: VizHeatmapQuery) {
    return createHeatmap(this.points, this.metricKeys, query);
  }

  getHistogram(query: VizHistogramQuery) {
    return createHistogram(this.points, this.metricKeys, query);
  }

  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null {
    return this.byId.get(pointId) ?? null;
  }

  getRollingSeries(query: VizRollingSeriesQuery) {
    return createRollingSeries(this.points, query);
  }

  getSeriesBounds() {
    return getSeriesBounds(this.points);
  }
}
