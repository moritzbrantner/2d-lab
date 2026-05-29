import { afterEach, describe, expect, test, vi } from "vitest";

import { ProgressiveVizDensityIndex } from "./progressive-density-index";

import type { VizSeriesPoint } from "../types";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2, metrics: { count: 1 } },
  { id: "b", x: 10, y: 4, metrics: { count: 1 } },
  { id: "c", x: 20, y: 8, metrics: { count: 1 } },
  { id: "d", x: 30, y: 16, metrics: { count: 1 } },
  { id: "e", x: 40, y: 32, metrics: { count: 1 } },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProgressiveVizDensityIndex", () => {
  test("starts with JS capabilities before idle warmup runs", () => {
    vi.stubGlobal("requestIdleCallback", vi.fn());

    const index = new ProgressiveVizDensityIndex(points);

    expect(index.getBackendCapabilities()).toEqual({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
    expect(index.getChartSeries({ targetBinCount: 4, xDomain: [0, 40] }).summary).toMatchObject({
      pointCount: 5,
      sampleCount: 4,
    });
  });

  test("warms to the Rust wasm index idempotently with equivalent public results", async () => {
    vi.stubGlobal("requestIdleCallback", vi.fn());

    const index = new ProgressiveVizDensityIndex(points);
    const before = publicDensityResult(index);

    await index.warmWasmIndex();
    await index.warmWasmIndex();

    expect(index.getBackendCapabilities()).toEqual({
      backend: "wasm",
      implementation: "rust-viz-engine-wasm",
      usesWasm: true,
    });
    expect(publicDensityResult(index)).toEqual(before);
    expect(index.getPointById("c")).toMatchObject({ id: "c", sourceIndex: 2 });
  });
});

function publicDensityResult(index: ProgressiveVizDensityIndex) {
  return {
    bounds: index.getSeriesBounds(),
    heatmap: index
      .getHeatmap({
        includeEmptyCells: true,
        xBinCount: 4,
        xDomain: [0, 40],
        yBinCount: 4,
        yDomain: [0, 40],
      })
      .cells.map((cell) => [
        cell.pointCount,
        cell.value,
        cell.firstPointIndex,
        cell.lastPointIndex,
      ]),
    histogram: index
      .getHistogram({ bucketCount: 4, includeEmptyBuckets: true, xDomain: [0, 40] })
      .buckets.map((bucket) => [
        bucket.pointCount,
        bucket.averageValue,
        bucket.firstPointIndex,
        bucket.lastPointIndex,
      ]),
    series: index
      .getChartSeries({
        includeEmptyBins: true,
        targetBinCount: 4,
        valueMode: "sum",
        xDomain: [0, 40],
      })
      .samples.map((sample) => [
        sample.pointCount,
        sample.y,
        sample.firstPointIndex,
        sample.lastPointIndex,
      ]),
  };
}
