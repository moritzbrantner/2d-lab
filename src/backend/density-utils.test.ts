import { describe, expect, test } from "vitest";

import {
  collectMetricKeys,
  createBins,
  createChartSeries,
  createHeatmap,
  createHistogram,
  createPointLookup,
  getSeriesBounds,
  normalizeDomain,
  normalizeMetrics,
  normalizeSeriesPoints,
  type NormalizedSeriesPoint,
} from "./density-utils";

import type { VizSeriesPoint } from "../types";

const rawPoints: VizSeriesPoint<{ group: string }>[] = [
  { id: "later", x: 10, y: 5, metrics: { a: 2 }, properties: { group: "b" } },
  { id: "first", x: 0, y: 1, label: "First", metrics: { b: 3 }, properties: { group: "a" } },
  { id: "bad-x", x: Number.NaN, y: 1 },
  { id: "same-x", x: 10, y: 7, metrics: { a: Number.NaN, c: 4 } },
  { id: "bad-y", x: 11, y: Number.POSITIVE_INFINITY },
];

function normalized() {
  return normalizeSeriesPoints(rawPoints);
}

describe("density utils", () => {
  test("normalizes, filters, and sorts series points", () => {
    expect(normalized()).toMatchObject([
      { id: "first", sourceIndex: 1, x: 0, y: 1, metrics: { b: 3 } },
      { id: "later", sourceIndex: 0, x: 10, y: 5, metrics: { a: 2 } },
      { id: "same-x", sourceIndex: 3, x: 10, y: 7, metrics: { c: 4 } },
    ]);
  });

  test("collects sorted metric keys and creates point lookups", () => {
    const points = normalized();
    const lookup = createPointLookup(points);

    expect(collectMetricKeys(points)).toEqual(["a", "b", "c"]);
    expect(lookup.bySourceIndex.get(1)?.id).toBe("first");
    expect(lookup.byId.get("same-x")?.sourceIndex).toBe(3);
  });

  test("computes series bounds and normalizes domains and metrics", () => {
    expect(getSeriesBounds([])).toBeNull();
    expect(getSeriesBounds(normalized())).toEqual({ maxX: 10, maxY: 7, minX: 0, minY: 1 });
    expect(normalizeDomain([20, 10])).toEqual([10, 20]);
    expect(normalizeDomain([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([0, 0]);
    expect(normalizeMetrics({ a: 1, b: Number.NaN, c: Number.NEGATIVE_INFINITY })).toEqual({
      a: 1,
    });
  });

  test("creates bins with empty filtering, boundary inclusion, and metric totals", () => {
    const points = normalized();
    const bins = createBins(points, collectMetricKeys(points), {
      includeEmptyBins: true,
      targetBinCount: 4,
      xDomain: [0, 10],
    });

    expect(bins.map((bin) => bin.pointCount)).toEqual([1, 0, 0, 2]);
    expect(bins[3]).toMatchObject({
      averageY: 6,
      firstPointIndex: 0,
      lastPointIndex: 3,
      maxY: 7,
      metrics: { a: 2, b: 0, c: 4 },
      minY: 5,
      sumY: 12,
      x1: 10,
    });

    expect(
      createBins(points, collectMetricKeys(points), {
        includeEmptyBins: false,
        targetBinCount: Number.NaN,
        xDomain: [10, 0],
      }).map((bin) => bin.pointCount),
    ).toEqual([3]);
  });

  test("creates chart series for every value mode", () => {
    const points = normalized();
    const metricKeys = collectMetricKeys(points);
    const values = ["average", "count", "max", "min", "sum"] as const;

    expect(
      values.map((valueMode) =>
        createChartSeries(points, metricKeys, {
          includeEmptyBins: true,
          targetBinCount: 4,
          valueMode,
          xDomain: [0, 10],
        }).samples.map((sample) => sample.y),
      ),
    ).toEqual([
      [1, null, null, 6],
      [1, 0, 0, 2],
      [1, null, null, 7],
      [1, null, null, 5],
      [1, null, null, 12],
    ]);
  });

  test("creates histograms with derived and explicit domains", () => {
    const points = normalized();
    const metricKeys = collectMetricKeys(points);
    const histogram = createHistogram(points, metricKeys, {
      bucketCount: 3,
      includeEmptyBuckets: true,
      xDomain: [0, 10],
    });

    expect(histogram.summary).toMatchObject({
      bucketCount: 3,
      metrics: { a: 2, b: 3, c: 4 },
      pointCount: 3,
      valueDomain: [1, 7],
      xDomain: [0, 10],
    });
    expect(histogram.buckets.map((bucket) => bucket.pointCount)).toEqual([1, 0, 2]);

    expect(
      createHistogram(points, metricKeys, {
        bucketCount: 4,
        includeEmptyBuckets: false,
        valueDomain: [0, 8],
        xDomain: [10, 10],
      }).buckets.map((bucket) => bucket.pointCount),
    ).toEqual([1, 1]);
  });

  test("creates heatmaps with cell indexing, values, and empty filtering", () => {
    const points: NormalizedSeriesPoint<Record<string, unknown>>[] = normalizeSeriesPoints([
      { id: "a", x: 0, y: 0, metrics: { demand: 2 } },
      { id: "b", x: 4, y: 4, metrics: { demand: 3 } },
      { id: "c", x: 4, y: 4, metrics: { demand: 5 } },
      { id: "d", x: 10, y: 10, metrics: { demand: 7 } },
    ]);
    const heatmap = createHeatmap(points, collectMetricKeys(points), {
      includeEmptyCells: true,
      xBinCount: 2,
      xDomain: [0, 10],
      yBinCount: 2,
      yDomain: [0, 10],
    });

    expect(heatmap.summary).toMatchObject({
      maxCellCount: 3,
      metrics: { demand: 17 },
      pointCount: 4,
      xBinCount: 2,
      yBinCount: 2,
    });
    expect(heatmap.cells.map((cell) => cell.pointCount)).toEqual([3, 0, 0, 1]);
    expect(heatmap.cells[0]).toMatchObject({
      averageValue: 8 / 3,
      metrics: { demand: 10 },
      value: 1,
      xIndex: 0,
      yIndex: 0,
    });

    expect(
      createHeatmap(points, collectMetricKeys(points), {
        includeEmptyCells: false,
        xBinCount: 2,
        xDomain: [0, 10],
        yBinCount: 2,
      }).cells.map((cell) => cell.pointCount),
    ).toEqual([3, 1]);
  });
});
