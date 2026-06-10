import { describe, expect, test } from "vitest";

import { JsVizDensityIndex } from "./js-density-index";
import { RustWasmVizDensityIndex } from "./rust-wasm-density-index";
import { embeddedVizWasmModule } from "../wasm/embedded-module";

import type { VizDensityIndex, VizSeriesPoint, VizValueMode } from "../types";

const points: VizSeriesPoint<{ group: string }>[] = [
  {
    id: "c",
    label: "C",
    x: 20,
    y: 8,
    metrics: { count: 1, weight: 8 },
    properties: { group: "x" },
  },
  { id: "a", label: "A", x: 0, y: 2, metrics: { count: 1, weight: 2 }, properties: { group: "x" } },
  { id: "bad-x", x: Number.NaN, y: 1 },
  { id: "bad-metric", x: 5, y: 3, metrics: { count: Number.NaN, weight: 3 } },
  {
    id: "b",
    label: "B",
    x: 10,
    y: 4,
    metrics: { count: 1, weight: 4 },
    properties: { group: "y" },
  },
  {
    id: "d",
    label: "D",
    x: 30,
    y: 16,
    metrics: { count: 1, weight: 16 },
    properties: { group: "y" },
  },
  {
    id: "e",
    label: "E",
    x: 40,
    y: 32,
    metrics: { count: 1, weight: 32 },
    properties: { group: "z" },
  },
];

describe("RustWasmVizDensityIndex", () => {
  test("reports wasm capabilities and preserves point lookup data", () => {
    const index = new RustWasmVizDensityIndex(points, embeddedVizWasmModule);

    expect(index.getBackendCapabilities()).toEqual({
      backend: "wasm",
      implementation: "rust-viz-engine-wasm",
      usesWasm: true,
    });
    expect(index.getPointById("a")).toMatchObject({
      id: "a",
      label: "A",
      metrics: { count: 1, weight: 2 },
      properties: { group: "x" },
      sourceIndex: 1,
    });
    expect(index.getPointById("missing")).toBeNull();
  });

  test("matches the JS density index for public query outputs", () => {
    const js = new JsVizDensityIndex(points);
    const wasm = new RustWasmVizDensityIndex(points, embeddedVizWasmModule);

    expect(publicResults(wasm)).toEqual(publicResults(js));
  });

  test("matches JS compact density outputs", () => {
    const js = new JsVizDensityIndex(points);
    const wasm = new RustWasmVizDensityIndex(points, embeddedVizWasmModule);

    expect(compactResults(wasm)).toEqual(compactResults(js));
  });

  test("matches object input when constructed from typed xy arrays", () => {
    const finitePoints = points.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    const typed = new RustWasmVizDensityIndex(
      {
        ids: finitePoints.map((point) => point.id ?? ""),
        labels: finitePoints.map((point) => point.label ?? ""),
        kind: "xy",
        metricKeys: ["count", "weight"],
        metrics: new Float64Array(
          finitePoints.flatMap((point) => [
            Number.isFinite(point.metrics?.count) ? point.metrics!.count : 0,
            Number.isFinite(point.metrics?.weight) ? point.metrics!.weight : 0,
          ]),
        ),
        sourceIndices: new Uint32Array(finitePoints.map((_, index) => index)),
        x: new Float64Array(finitePoints.map((point) => point.x)),
        y: new Float64Array(finitePoints.map((point) => point.y)),
      },
      embeddedVizWasmModule,
    );
    const object = new RustWasmVizDensityIndex(
      finitePoints.map((point, sourceIndex) => ({ ...point, sourceIndex })),
      embeddedVizWasmModule,
    );

    expect(compactResults(typed)).toEqual(compactResults(object));
  });

  test("handles empty input like the JS density index", () => {
    expect(publicResults(new RustWasmVizDensityIndex([], embeddedVizWasmModule))).toEqual(
      publicResults(new JsVizDensityIndex([])),
    );
  });
});

function publicResults(index: VizDensityIndex) {
  const modes: VizValueMode[] = [
    "average",
    "count",
    "max",
    "min",
    "sum",
    "p10",
    "p25",
    "p50",
    "p75",
    "p90",
    "p95",
    "p99",
  ];

  return {
    bounds: index.getSeriesBounds(),
    binned: index
      .getBinnedSeries({ includeEmptyBins: true, targetBinCount: 4, xDomain: [0, 40] })
      .bins.map(publicBin),
    heatmap: index
      .getHeatmap({ includeEmptyCells: true, xBinCount: 4, xDomain: [0, 40], yBinCount: 4 })
      .cells.map((cell) => ({
        averageValue: cell.averageValue,
        firstPointIndex: cell.firstPointIndex,
        lastPointIndex: cell.lastPointIndex,
        metrics: cell.metrics,
        pointCount: cell.pointCount,
        sumValue: cell.sumValue,
        value: cell.value,
        xIndex: cell.xIndex,
        yIndex: cell.yIndex,
      })),
    heatmapMetric: index
      .getHeatmap({
        includeEmptyCells: true,
        valueAccessor: { metric: "weight" },
        xBinCount: 4,
        xDomain: [0, 40],
        yBinCount: 4,
      })
      .cells.map((cell) => ({
        averageValue: cell.averageValue,
        metrics: cell.metrics,
        pointCount: cell.pointCount,
        sumValue: cell.sumValue,
      })),
    histogram: index
      .getHistogram({ bucketCount: 4, includeEmptyBuckets: true, xDomain: [0, 40] })
      .buckets.map((bucket) => ({
        averageValue: bucket.averageValue,
        firstPointIndex: bucket.firstPointIndex,
        lastPointIndex: bucket.lastPointIndex,
        maxValue: bucket.maxValue,
        metrics: bucket.metrics,
        minValue: bucket.minValue,
        pointCount: bucket.pointCount,
        sumValue: bucket.sumValue,
      })),
    histogramX: index
      .getHistogram({
        bucketCount: 4,
        includeEmptyBuckets: true,
        valueAccessor: "x",
        xDomain: [0, 40],
      })
      .buckets.map((bucket) => ({
        averageValue: bucket.averageValue,
        metrics: bucket.metrics,
        pointCount: bucket.pointCount,
        sumValue: bucket.sumValue,
      })),
    rolling: index
      .getRollingSeries({
        alpha: 0.5,
        minPeriods: 2,
        statistic: "zScore",
        windowSize: 3,
        xDomain: [0, 40],
      })
      .points.map((point) => ({
        ema: point.ema,
        max: point.max,
        mean: point.mean,
        min: point.min,
        pointCount: point.pointCount,
        sourcePointIndex: point.sourcePointIndex,
        stdDev: point.stdDev,
        sum: point.sum,
        x: point.x,
        y: point.y,
        zScore: point.zScore,
      })),
    rollingDefault: index
      .getRollingSeries({
        windowSize: 3,
        xDomain: [0, 40],
      })
      .points.map((point) => point.y),
    series: modes.map((valueMode) =>
      index
        .getChartSeries({
          includeEmptyBins: true,
          percentiles: ["p10", "p25", "p50", "p75", "p90", "p95", "p99"],
          targetBinCount: 4,
          valueMode,
          xDomain: [0, 40],
        })
        .samples.map((sample) => ({
          ...publicBin(sample),
          p10: sample.p10,
          p25: sample.p25,
          p50: sample.p50,
          p75: sample.p75,
          p90: sample.p90,
          p95: sample.p95,
          p99: sample.p99,
          x: sample.x,
          y: sample.y,
        })),
    ),
  };
}

function compactResults(index: VizDensityIndex) {
  const chart = index.getCompactChartSeries({
    includeEmptyBins: true,
    targetBinCount: 4,
    valueMode: "average",
    xDomain: [0, 40],
  });
  const histogram = index.getCompactHistogram({
    bucketCount: 4,
    includeEmptyBuckets: true,
    xDomain: [0, 40],
  });
  const heatmap = index.getCompactHeatmap({
    includeEmptyCells: false,
    xBinCount: 4,
    xDomain: [0, 40],
    yBinCount: 4,
  });
  const rolling = index.getCompactRollingSeries({
    alpha: 0.5,
    minPeriods: 2,
    statistic: "zScore",
    windowSize: 3,
    xDomain: [0, 40],
  });

  return {
    chart: {
      firstPointIndex: [...chart.firstPointIndex],
      lastPointIndex: [...chart.lastPointIndex],
      pointCount: [...chart.pointCount],
      sumY: [...chart.sumY],
      x0: [...chart.x0],
      x1: [...chart.x1],
      y: [...chart.y],
      summary: chart.summary,
    },
    heatmap: {
      firstPointIndex: [...heatmap.firstPointIndex],
      lastPointIndex: [...heatmap.lastPointIndex],
      pointCount: [...heatmap.pointCount],
      sumValue: [...heatmap.sumValue],
      value: [...heatmap.value],
      xIndex: [...heatmap.xIndex],
      yIndex: [...heatmap.yIndex],
      summary: heatmap.summary,
    },
    histogram: {
      firstPointIndex: [...histogram.firstPointIndex],
      lastPointIndex: [...histogram.lastPointIndex],
      pointCount: [...histogram.pointCount],
      sumValue: [...histogram.sumValue],
      value0: [...histogram.value0],
      value1: [...histogram.value1],
      summary: histogram.summary,
    },
    rolling: {
      pointCount: [...rolling.pointCount],
      sourcePointIndex: [...rolling.sourcePointIndex],
      x: [...rolling.x],
      y: [...rolling.y],
      summary: rolling.summary,
    },
  };
}

function publicBin(bin: ReturnType<VizDensityIndex["getBinnedSeries"]>["bins"][number]) {
  return {
    averageY: bin.averageY,
    firstPointIndex: bin.firstPointIndex,
    lastPointIndex: bin.lastPointIndex,
    maxY: bin.maxY,
    metrics: bin.metrics,
    minY: bin.minY,
    pointCount: bin.pointCount,
    sumY: bin.sumY,
    x0: bin.x0,
    x1: bin.x1,
  };
}
