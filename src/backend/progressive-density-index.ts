import { JsVizDensityIndex } from "./js-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";

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

export class ProgressiveVizDensityIndex<
  TProperties = Record<string, unknown>,
> implements VizDensityIndex<TProperties> {
  private readonly jsIndex: VizDensityIndex<TProperties>;
  private readonly pointCount: number;
  private compactIndex: VizDensityIndex<TProperties>;
  private warmupError: unknown = null;
  private warmupPromise: Promise<void> | null = null;
  private wasmIndex: VizDensityIndex<TProperties> | null = null;

  constructor(
    private readonly points: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>,
    private readonly createWasmIndex: (
      points: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>,
    ) => VizDensityIndex<TProperties> = (points) => new RustWasmVizDensityIndex(points),
  ) {
    this.pointCount = getXyPointCount(points);
    this.jsIndex = new JsVizDensityIndex(points);
    this.compactIndex = this.jsIndex;
    if (this.pointCount >= WASM_COMPACT_WARMUP_POINT_THRESHOLD) {
      this.scheduleWarmup();
    }
  }

  getBackendCapabilities() {
    return this.compactIndex.getBackendCapabilities();
  }

  getBinnedSeries(query: VizBinnedSeriesQuery) {
    return this.jsIndex.getBinnedSeries(query);
  }

  getChartSeries(query: VizDensityQuery) {
    return this.jsIndex.getChartSeries(query);
  }

  getCompactChartSeries(query: VizDensityQuery) {
    return this.compactIndex.getCompactChartSeries(query);
  }

  getCompactHeatmap(query: VizHeatmapQuery) {
    return this.compactIndex.getCompactHeatmap(query);
  }

  getCompactHistogram(query: VizHistogramQuery) {
    return this.compactIndex.getCompactHistogram(query);
  }

  getCompactRollingSeries(query: VizRollingSeriesQuery) {
    return this.compactIndex.getCompactRollingSeries(query);
  }

  getHeatmap(query: VizHeatmapQuery) {
    return this.jsIndex.getHeatmap(query);
  }

  getHistogram(query: VizHistogramQuery) {
    return this.jsIndex.getHistogram(query);
  }

  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null {
    return this.jsIndex.getPointById(pointId);
  }

  getRollingSeries(query: VizRollingSeriesQuery) {
    return this.jsIndex.getRollingSeries(query);
  }

  getSeriesBounds() {
    return this.jsIndex.getSeriesBounds();
  }

  useWasmIndex() {
    if (this.wasmIndex) {
      this.compactIndex = this.wasmIndex;
      return;
    }

    this.wasmIndex = this.createWasmIndex(this.points);
    this.compactIndex = this.wasmIndex;
    this.warmupError = null;
    this.warmupPromise = Promise.resolve();
  }

  preferCompactBackend(context: {
    layerKind: "binned-series" | "heatmap" | "histogram" | "rolling-series";
    pointCount?: number;
  }) {
    if (!isWasmCompactCandidate(context.layerKind)) {
      return;
    }

    if ((context.pointCount ?? this.pointCount) < WASM_COMPACT_WARMUP_POINT_THRESHOLD) {
      return;
    }

    if (this.wasmIndex) {
      this.compactIndex = this.wasmIndex;
      return;
    }

    void this.warmWasmIndex();
  }

  warmWasmIndex() {
    this.warmupPromise ??= Promise.resolve()
      .then(() => {
        this.useWasmIndex();
      })
      .catch((error: unknown) => {
        this.warmupError = error;
      });

    return this.warmupPromise;
  }

  getWarmupError() {
    return this.warmupError;
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

const WASM_COMPACT_WARMUP_POINT_THRESHOLD = 5_000;

function getXyPointCount<TProperties>(
  points: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>,
) {
  if (Array.isArray(points)) {
    return points.length;
  }

  const dataset = points as VizXyDataset<TProperties>;
  if ("points" in dataset) {
    return dataset.points.length;
  }

  return Math.min(dataset.x.length, dataset.y.length);
}

function isWasmCompactCandidate(
  layerKind: "binned-series" | "heatmap" | "histogram" | "rolling-series",
) {
  switch (layerKind) {
    case "binned-series":
    case "heatmap":
    case "histogram":
    case "rolling-series":
      return true;
  }
}
