import {
  collectMetricKeys,
  createBins,
  createChartSeries,
  createHeatmap,
  createHistogram,
  createPointLookup,
  getSeriesBounds,
  normalizeSeriesPoints,
  type NormalizedSeriesPoint,
} from "./density-utils";

import type {
  VizBinnedSeriesQuery,
  VizDensityIndex,
  VizDensityQuery,
  VizHeatmapQuery,
  VizHistogramQuery,
  VizIndexedSeriesPoint,
  VizSeriesPoint,
} from "../types";

export class JsVizDensityIndex<
  TProperties = Record<string, unknown>,
> implements VizDensityIndex<TProperties> {
  private readonly byId: Map<string, NormalizedSeriesPoint<TProperties>>;
  private readonly metricKeys: string[];
  private readonly points: Array<NormalizedSeriesPoint<TProperties>>;

  constructor(points: readonly VizSeriesPoint<TProperties>[]) {
    this.points = normalizeSeriesPoints(points);
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

  getHeatmap(query: VizHeatmapQuery) {
    return createHeatmap(this.points, this.metricKeys, query);
  }

  getHistogram(query: VizHistogramQuery) {
    return createHistogram(this.points, this.metricKeys, query);
  }

  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null {
    return this.byId.get(pointId) ?? null;
  }

  getSeriesBounds() {
    return getSeriesBounds(this.points);
  }
}
