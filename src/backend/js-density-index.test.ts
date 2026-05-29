import { describe, expect, test } from "vitest";

import { JsVizDensityIndex } from "./js-density-index";

import type { VizSeriesPoint } from "../types";

const points: VizSeriesPoint[] = [
  { id: "c", x: 20, y: 8, metrics: { count: 1 } },
  { id: "a", x: 0, y: 2, label: "A", metrics: { count: 1 } },
  { id: "bad", x: Number.NaN, y: 1 },
  { id: "b", x: 10, y: 4, metrics: { count: 1 } },
  { id: "d", x: 30, y: 16, metrics: { count: 1 } },
  { id: "e", x: 40, y: 32, metrics: { count: 1 } },
];

describe("JsVizDensityIndex", () => {
  test("reports capabilities and normalized point lookup", () => {
    const index = new JsVizDensityIndex(points);

    expect(index.getBackendCapabilities()).toEqual({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
    expect(index.getPointById("a")).toMatchObject({ id: "a", label: "A", sourceIndex: 1 });
    expect(index.getPointById("missing")).toBeNull();
  });

  test("computes bounds for empty and populated indexes", () => {
    expect(new JsVizDensityIndex([]).getSeriesBounds()).toBeNull();
    expect(new JsVizDensityIndex(points).getSeriesBounds()).toEqual({
      maxX: 40,
      maxY: 32,
      minX: 0,
      minY: 2,
    });
  });

  test("creates binned, chart, histogram, and heatmap outputs", () => {
    const index = new JsVizDensityIndex(points);

    expect(
      index
        .getBinnedSeries({ targetBinCount: 4, xDomain: [0, 40] })
        .bins.map((bin) => bin.pointCount),
    ).toEqual([1, 1, 1, 2]);
    expect(
      index
        .getChartSeries({
          includeEmptyBins: true,
          targetBinCount: 4,
          valueMode: "sum",
          xDomain: [0, 40],
        })
        .samples.map((sample) => sample.y),
    ).toEqual([2, 4, 8, 48]);
    expect(
      index
        .getHistogram({ bucketCount: 4, includeEmptyBuckets: true, xDomain: [0, 40] })
        .buckets.map((bucket) => bucket.pointCount),
    ).toEqual([3, 1, 0, 1]);
    expect(
      index.getHeatmap({
        includeEmptyCells: true,
        xBinCount: 4,
        xDomain: [0, 40],
        yBinCount: 4,
        yDomain: [0, 40],
      }).summary,
    ).toMatchObject({ maxCellCount: 1, pointCount: 5 });
  });

  test("omits empty bins by default for binned and chart series", () => {
    const index = new JsVizDensityIndex(points);

    expect(
      index
        .getBinnedSeries({ targetBinCount: 8, xDomain: [0, 40] })
        .bins.map((bin) => bin.pointCount),
    ).toEqual([1, 1, 1, 1, 1]);
    expect(index.getChartSeries({ targetBinCount: 8, xDomain: [0, 40] }).samples).toHaveLength(5);
  });
});
