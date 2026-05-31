import { getD3BinnedSeries, getD3Heatmap, getD3Histogram } from "../adapters/d3-array";
import { getSimpleStatisticsRollingSeries } from "../adapters/simple-statistics";
import {
  createVizEngine,
  JsVizDensityIndex,
  RustWasmVizDensityIndex,
} from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createXyFixture } from "../fixtures/xy";
import { assert, assertClose, assertPositive, createCaseId } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";

export function createXyCases(config: BenchmarkConfig): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const size of config.xySizes) {
    const fixture = createXyFixture(size, config.settings.seed);
    const sizeLabel = formatSize(size);
    const binnedQueries = [
      { name: "full-256", targetBinCount: 256, xDomain: fixture.domains.full },
      { name: "full-1024", targetBinCount: 1024, xDomain: fixture.domains.full },
      { name: "viewport-256", targetBinCount: 256, xDomain: fixture.domains.viewport },
      { name: "viewport-1024", targetBinCount: 1024, xDomain: fixture.domains.viewport },
    ] as const;
    const histogramQueries = [
      { bucketCount: 128, name: "all-128" },
      { bucketCount: 512, name: "all-512" },
      { bucketCount: 128, name: "viewport-128", xDomain: fixture.domains.viewport },
    ] as const;
    const heatmapQueries = [
      { name: "full-64x32", xBinCount: 64, xDomain: fixture.domains.full, yBinCount: 32 },
      { name: "full-128x64", xBinCount: 128, xDomain: fixture.domains.full, yBinCount: 64 },
      { name: "viewport-64x32", xBinCount: 64, xDomain: fixture.domains.viewport, yBinCount: 32 },
    ] as const;
    const rollingQueries = [
      { name: "mean-32", statistic: "mean" as const, windowSize: 32 },
      { name: "stdDev-128", statistic: "stdDev" as const, windowSize: 128 },
      { name: "zScore-128", statistic: "zScore" as const, windowSize: 128 },
    ] as const;

    cases.push(
      createXyIndexCase("viz-engine js", size, () => new JsVizDensityIndex(fixture.points)),
      createXyIndexCase("viz-engine wasm", size, () => new RustWasmVizDensityIndex(fixture.points)),
      createXyIndexCase("viz-engine engine-js", size, () => {
        const engine = createVizEngine({ backend: "js" });
        engine.addDataset({ kind: "xy", points: fixture.points });
        return engine;
      }),
      createXyIndexCase("viz-engine engine-wasm", size, () => {
        const engine = createVizEngine({ backend: "wasm" });
        engine.addDataset({ kind: "xy", points: fixture.points });
        return engine;
      }),
    );

    for (const query of binnedQueries) {
      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "binned", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getChartSeries({
              includeEmptyBins: false,
              targetBinCount: query.targetBinCount,
              valueMode: "average",
              xDomain: query.xDomain,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getChartSeries(
              {
                targetBinCount: query.targetBinCount,
                xDomain: query.xDomain,
              },
            );
            assertPositive(output.summary.sampleCount, "binned sample count");
            assertPositive(output.summary.pointCount, "binned point count");
          },
          workload: `binned/${query.name}`,
        });
      }

      cases.push({
        category: "xy",
        external: true,
        id: createCaseId(["xy", "binned", query.name, sizeLabel, "d3-array"]),
        implementation: "d3-array",
        notes: ["Comparable binning workload; output shape is normalized by adapter."],
        prepare: () => fixture.points,
        run: () => getD3BinnedSeries(fixture.points, { ...query, includeEmptyBins: false }),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const viz = new JsVizDensityIndex(fixture.points).getChartSeries({
            targetBinCount: query.targetBinCount,
            xDomain: query.xDomain,
          });
          const d3 = getD3BinnedSeries(fixture.points, { ...query, includeEmptyBins: false });
          assertPositive(d3.bins.length, "d3 bin count");
          assertClose(viz.summary.pointCount, d3.pointCount, "d3 binned point count");
        },
        workload: `binned/${query.name}`,
      });
    }

    for (const query of histogramQueries) {
      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "histogram", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getHistogram({
              bucketCount: query.bucketCount,
              xDomain: query.xDomain,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getHistogram(
              query,
            );
            assertPositive(output.buckets.length, "histogram bucket count");
            assertPositive(output.summary.pointCount, "histogram point count");
          },
          workload: `histogram/${query.name}`,
        });
      }

      cases.push({
        category: "xy",
        external: true,
        id: createCaseId(["xy", "histogram", query.name, sizeLabel, "d3-array"]),
        implementation: "d3-array",
        notes: ["Comparable y-domain histogram workload."],
        prepare: () => fixture.points,
        run: () => getD3Histogram(fixture.points, query),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const output = getD3Histogram(fixture.points, query);
          assertPositive(output.bins.length, "d3 histogram bucket count");
          assertPositive(output.pointCount, "d3 histogram point count");
        },
        workload: `histogram/${query.name}`,
      });
    }

    for (const query of heatmapQueries) {
      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "heatmap", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getHeatmap(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getHeatmap(
              query,
            );
            assertPositive(output.cells.length, "heatmap cell count");
            assertPositive(output.summary.pointCount, "heatmap point count");
          },
          workload: `heatmap/${query.name}`,
        });
      }

      cases.push({
        category: "xy",
        external: true,
        id: createCaseId(["xy", "heatmap", query.name, sizeLabel, "d3-array-adapter"]),
        implementation: "d3-array-adapter",
        notes: ["Manual bucket-index adapter with D3-style grouping semantics."],
        prepare: () => fixture.points,
        run: () => getD3Heatmap(fixture.points, query),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const output = getD3Heatmap(fixture.points, query);
          assertPositive(output.cells.length, "d3 heatmap cell count");
          assertPositive(output.pointCount, "d3 heatmap point count");
        },
        workload: `heatmap/${query.name}`,
      });
    }

    for (const query of rollingQueries) {
      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "rolling", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getRollingSeries({
              statistic: query.statistic,
              windowSize: query.windowSize,
              xDomain: fixture.domains.full,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizDensityIndex | RustWasmVizDensityIndex
            ).getRollingSeries({
              statistic: query.statistic,
              windowSize: query.windowSize,
              xDomain: fixture.domains.full,
            });
            assertPositive(output.points.length, "rolling point count");
          },
          workload: `rolling/${query.name}`,
        });
      }

      cases.push({
        category: "xy",
        external: true,
        id: createCaseId(["xy", "rolling", query.name, sizeLabel, "simple-statistics-adapter"]),
        implementation: "simple-statistics-adapter",
        notes: ["Adapter uses simple-statistics primitives per rolling window."],
        prepare: () => fixture.points,
        run: () =>
          getSimpleStatisticsRollingSeries(fixture.points, {
            statistic: query.statistic,
            windowSize: query.windowSize,
            xDomain: fixture.domains.full,
          }),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const output = getSimpleStatisticsRollingSeries(fixture.points, {
            statistic: query.statistic,
            windowSize: query.windowSize,
            xDomain: fixture.domains.full,
          });
          assertPositive(output.points.length, "simple-statistics rolling point count");
        },
        workload: `rolling/${query.name}`,
      });
    }
  }

  return cases;
}

function createXyIndexCase(
  implementation: string,
  size: number,
  construct: () => unknown,
): BenchmarkCase {
  const sizeLabel = formatSize(size);

  return {
    category: "xy",
    id: createCaseId(["xy", "index", sizeLabel, implementation.replaceAll(" ", "-")]),
    implementation,
    prepare: () => null,
    run: () => construct(),
    size: sizeLabel,
    sizeValue: size,
    validate: () => {
      assert(construct(), `${implementation} index construction should return a value`);
    },
    workload: "index-construction",
  };
}
