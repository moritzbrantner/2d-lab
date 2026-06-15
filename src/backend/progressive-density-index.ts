import { JsVizDensityIndex } from "./js-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { embeddedVizWasmModule } from "../wasm/embedded-module";

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
  private typedIndex: VizDensityIndex<TProperties>;
  private disposed = false;
  private warmupError: unknown = null;
  private warmupPromise: Promise<void> | null = null;
  private wasmIndex: VizDensityIndex<TProperties> | null = null;

  constructor(
    private readonly points: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>,
    private readonly createWasmIndex: (
      points: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>,
    ) => VizDensityIndex<TProperties> = (points) =>
      new RustWasmVizDensityIndex(points, embeddedVizWasmModule),
  ) {
    this.pointCount = getXyPointCount(points);
    this.jsIndex = new JsVizDensityIndex(points);
    this.typedIndex = this.jsIndex;
    if (this.pointCount >= WASM_TYPED_WARMUP_POINT_THRESHOLD) {
      this.scheduleWarmup();
    }
  }

  getBackendCapabilities() {
    return this.typedIndex.getBackendCapabilities();
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    disposeIndex(this.jsIndex);
    if (this.wasmIndex && this.wasmIndex !== this.jsIndex) {
      disposeIndex(this.wasmIndex);
    }
    this.disposed = true;
  }

  getBinnedSeries(query: VizBinnedSeriesQuery) {
    return this.jsIndex.getBinnedSeries(query);
  }

  getChartSeries(query: VizDensityQuery) {
    return this.jsIndex.getChartSeries(query);
  }

  getTypedBinnedSeries(query: VizDensityQuery) {
    return this.typedIndex.getTypedBinnedSeries(query);
  }

  getTypedHeatmap(query: VizHeatmapQuery) {
    return this.typedIndex.getTypedHeatmap(query);
  }

  getTypedHistogram(query: VizHistogramQuery) {
    return this.typedIndex.getTypedHistogram(query);
  }

  getTypedRollingSeries(query: VizRollingSeriesQuery) {
    return this.typedIndex.getTypedRollingSeries(query);
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
      this.typedIndex = this.wasmIndex;
      return;
    }

    this.wasmIndex = this.createWasmIndex(this.points);
    this.typedIndex = this.wasmIndex;
    this.warmupError = null;
    this.warmupPromise = Promise.resolve();
  }

  preferTypedBackend(context: {
    layerKind: "binned-series" | "heatmap" | "histogram" | "rolling-series";
    pointCount?: number;
  }) {
    if (!isWasmTypedCandidate(context.layerKind)) {
      return;
    }

    if ((context.pointCount ?? this.pointCount) < WASM_TYPED_WARMUP_POINT_THRESHOLD) {
      return;
    }

    if (this.wasmIndex) {
      this.typedIndex = this.wasmIndex;
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

function disposeIndex<TProperties>(index: VizDensityIndex<TProperties>) {
  const disposable = index as VizDensityIndex<TProperties> & {
    dispose?: () => void;
    free?: () => void;
  };
  if (typeof disposable.dispose === "function") {
    disposable.dispose();
    return;
  }
  disposable.free?.();
}

const WASM_TYPED_WARMUP_POINT_THRESHOLD = 5_000;

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

function isWasmTypedCandidate(
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
