import { JsVizDensityIndex } from "./js-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";

import type {
  VizBinnedSeriesQuery,
  VizDensityIndex,
  VizDensityQuery,
  VizHeatmapQuery,
  VizHistogramQuery,
  VizIndexedSeriesPoint,
  VizSeriesPoint,
} from "../types";

export class ProgressiveVizDensityIndex<
  TProperties = Record<string, unknown>,
> implements VizDensityIndex<TProperties> {
  private activeIndex: VizDensityIndex<TProperties>;
  private warmupPromise: Promise<void> | null = null;

  constructor(private readonly points: readonly VizSeriesPoint<TProperties>[]) {
    this.activeIndex = new JsVizDensityIndex(points);
    this.scheduleWarmup();
  }

  getBackendCapabilities() {
    return this.activeIndex.getBackendCapabilities();
  }

  getBinnedSeries(query: VizBinnedSeriesQuery) {
    return this.activeIndex.getBinnedSeries(query);
  }

  getChartSeries(query: VizDensityQuery) {
    return this.activeIndex.getChartSeries(query);
  }

  getHeatmap(query: VizHeatmapQuery) {
    return this.activeIndex.getHeatmap(query);
  }

  getHistogram(query: VizHistogramQuery) {
    return this.activeIndex.getHistogram(query);
  }

  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null {
    return this.activeIndex.getPointById(pointId);
  }

  getSeriesBounds() {
    return this.activeIndex.getSeriesBounds();
  }

  warmWasmIndex() {
    this.warmupPromise ??= Promise.resolve().then(() => {
      this.activeIndex = new RustWasmVizDensityIndex(this.points);
    });

    return this.warmupPromise;
  }

  private scheduleWarmup() {
    const scheduler =
      typeof globalThis.requestIdleCallback === "function"
        ? globalThis.requestIdleCallback
        : (callback: IdleRequestCallback) => setTimeout(callback, 0);

    scheduler(() => {
      void this.warmWasmIndex();
    });
  }
}
