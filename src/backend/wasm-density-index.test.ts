import { describe, expect, test } from "vitest";

import { JsVizDensityIndex } from "./js-density-index";
import { WasmVizDensityIndex } from "./wasm-density-index";

import type { VizDensityIndex, VizSeriesPoint } from "../types";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2, metrics: { count: 1 } },
  { id: "b", x: 10, y: 4, metrics: { count: 1 } },
  { id: "c", x: 20, y: 8, metrics: { count: 1 } },
  { id: "d", x: 30, y: 16, metrics: { count: 1 } },
  { id: "e", x: 40, y: 32, metrics: { count: 1 } },
];

describe("WasmVizDensityIndex", () => {
  test("reports legacy wasm capabilities", () => {
    expect(new WasmVizDensityIndex(points).getBackendCapabilities()).toEqual({
      backend: "wasm",
      implementation: "legacy-wasm",
      usesWasm: true,
    });
  });

  test("matches the JS density index for representative outputs", () => {
    expect(publicResults(new WasmVizDensityIndex(points))).toEqual(
      publicResults(new JsVizDensityIndex(points)),
    );
  });
});

function publicResults(index: VizDensityIndex) {
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
    point: index.getPointById("c"),
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
