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
    const wasmBoundaryQueries = {
      binned: {
        includeEmptyBins: false,
        targetBinCount: 1024,
        valueMode: "average" as const,
        xDomain: fixture.domains.full,
      },
      heatmap: {
        xBinCount: 128,
        xDomain: fixture.domains.full,
        yBinCount: 64,
      },
      histogram: {
        bucketCount: 512,
      },
      rolling: {
        statistic: "stdDev" as const,
        windowSize: 128,
        xDomain: fixture.domains.full,
      },
    };

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

      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "binned-compact", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation} compact`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getCompactChartSeries({
              includeEmptyBins: false,
              targetBinCount: query.targetBinCount,
              valueMode: "average",
              xDomain: query.xDomain,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizDensityIndex | RustWasmVizDensityIndex
            ).getCompactChartSeries({
              targetBinCount: query.targetBinCount,
              xDomain: query.xDomain,
            });
            assertPositive(output.summary.sampleCount, "compact binned sample count");
            assertPositive(output.summary.pointCount, "compact binned point count");
          },
          workload: `binned-compact/${query.name}`,
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

      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "histogram-compact", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation} compact`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getCompactHistogram({
              bucketCount: query.bucketCount,
              xDomain: query.xDomain,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizDensityIndex | RustWasmVizDensityIndex
            ).getCompactHistogram(query);
            assertPositive(output.summary.bucketCount, "compact histogram bucket count");
            assertPositive(output.summary.pointCount, "compact histogram point count");
          },
          workload: `histogram-compact/${query.name}`,
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

      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "heatmap-compact", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation} compact`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getCompactHeatmap(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizDensityIndex | RustWasmVizDensityIndex
            ).getCompactHeatmap(query);
            assertPositive(output.pointCount.length, "compact heatmap cell count");
            assertPositive(output.summary.pointCount, "compact heatmap point count");
          },
          workload: `heatmap-compact/${query.name}`,
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

      if (query.name === "full-128x64") {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "heatmap-variant", query.name, sizeLabel, "typed-full-shape"]),
          implementation: "viz-engine js typed-full-shape",
          notes: ["Production typed-accumulator heatmap with full cell shape."],
          prepare: () => new JsVizDensityIndex(fixture.points),
          run: (prepared) => (prepared as JsVizDensityIndex).getHeatmap(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizDensityIndex).getHeatmap(query);
            assertPositive(output.cells.length, "typed heatmap cell count");
            assertPositive(output.summary.pointCount, "typed heatmap point count");
          },
          workload: `heatmap-variant/${query.name}`,
        });

        cases.push({
          category: "xy",
          id: createCaseId([
            "xy",
            "heatmap-variant",
            query.name,
            sizeLabel,
            "sparse-populated-cells",
          ]),
          implementation: "viz-engine js sparse-populated-cells",
          notes: ["Production typed-accumulator heatmap with empty cells filtered."],
          prepare: () => new JsVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex).getHeatmap({
              ...query,
              includeEmptyCells: false,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizDensityIndex).getHeatmap({
              ...query,
              includeEmptyCells: false,
            });
            assertPositive(output.cells.length, "sparse heatmap cell count");
            assertPositive(output.summary.pointCount, "sparse heatmap point count");
          },
          workload: `heatmap-variant/${query.name}`,
        });
      }
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

      for (const implementation of ["js", "wasm"] as const) {
        cases.push({
          category: "xy",
          id: createCaseId(["xy", "rolling-compact", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation} compact`,
          prepare: () =>
            implementation === "js"
              ? new JsVizDensityIndex(fixture.points)
              : new RustWasmVizDensityIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizDensityIndex | RustWasmVizDensityIndex).getCompactRollingSeries({
              statistic: query.statistic,
              windowSize: query.windowSize,
              xDomain: fixture.domains.full,
            }),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizDensityIndex | RustWasmVizDensityIndex
            ).getCompactRollingSeries({
              statistic: query.statistic,
              windowSize: query.windowSize,
              xDomain: fixture.domains.full,
            });
            assertPositive(output.x.length, "compact rolling point count");
          },
          workload: `rolling-compact/${query.name}`,
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

    cases.push(...createWasmBoundaryCases(size, sizeLabel, fixture.points, wasmBoundaryQueries));
  }

  return cases;
}

function createWasmBoundaryCases(
  size: number,
  sizeLabel: string,
  points: ReturnType<typeof createXyFixture>["points"],
  queries: {
    binned: Parameters<RustWasmVizDensityIndex["getChartSeries"]>[0];
    heatmap: Parameters<RustWasmVizDensityIndex["getHeatmap"]>[0];
    histogram: Parameters<RustWasmVizDensityIndex["getHistogram"]>[0];
    rolling: Parameters<RustWasmVizDensityIndex["getRollingSeries"]>[0];
  },
): BenchmarkCase[] {
  return [
    ...createWasmBoundaryCase({
      hydrate: (index, raw) => ({
        bins: raw.bins.map((bin: unknown) => index.mapBin(bin)),
        samples: raw.samples.map((sample: unknown) => index.mapSample(sample)),
        summary: index.mapDensitySummary(raw.summary),
      }),
      idParts: ["xy", "wasm-boundary", "binned", sizeLabel],
      points,
      raw: (index) =>
        index.index.getBinnedSeries({
          ...queries.binned,
          includeEmptyBins: queries.binned.includeEmptyBins ?? false,
          valueMode: queries.binned.valueMode ?? "average",
        }),
      size,
      sizeLabel,
      validate: (output) => assertPositive(output.summary.pointCount, "wasm binned point count"),
      workload: "wasm-boundary/binned",
      wrapper: (index) => index.getChartSeries(queries.binned),
    }),
    ...createWasmBoundaryCase({
      hydrate: (index, raw) => ({
        cells: raw.cells.map((cell: unknown) => index.mapHeatmapCell(cell)),
        summary: { ...raw.summary, metrics: normalizeBoundaryMetrics(raw.summary.metrics) },
      }),
      idParts: ["xy", "wasm-boundary", "heatmap", sizeLabel],
      points,
      raw: (index) => index.index.getHeatmap(queries.heatmap),
      size,
      sizeLabel,
      validate: (output) => assertPositive(output.summary.pointCount, "wasm heatmap point count"),
      workload: "wasm-boundary/heatmap",
      wrapper: (index) => index.getHeatmap(queries.heatmap),
    }),
    ...createWasmBoundaryCase({
      hydrate: (index, raw) => ({
        buckets: raw.buckets.map((bucket: unknown) => index.mapHistogramBucket(bucket)),
        summary: { ...raw.summary, metrics: normalizeBoundaryMetrics(raw.summary.metrics) },
      }),
      idParts: ["xy", "wasm-boundary", "histogram", sizeLabel],
      points,
      raw: (index) =>
        index.index.getHistogram({
          ...queries.histogram,
          includeEmptyBuckets: queries.histogram.includeEmptyBuckets ?? true,
        }),
      size,
      sizeLabel,
      validate: (output) => assertPositive(output.summary.pointCount, "wasm histogram point count"),
      workload: "wasm-boundary/histogram",
      wrapper: (index) => index.getHistogram(queries.histogram),
    }),
    ...createWasmBoundaryCase({
      hydrate: (index, raw) => ({
        points: raw.points.map((point: unknown) => index.mapRollingPoint(point)),
        summary: raw.summary,
      }),
      idParts: ["xy", "wasm-boundary", "rolling", sizeLabel],
      points,
      raw: (index) =>
        index.index.getRollingSeries({
          ...queries.rolling,
          statistic: queries.rolling.statistic ?? "mean",
        }),
      size,
      sizeLabel,
      validate: (output) => assertPositive(output.points.length, "wasm rolling point count"),
      workload: "wasm-boundary/rolling",
      wrapper: (index) => index.getRollingSeries(queries.rolling),
    }),
  ];
}

function createWasmBoundaryCase(options: {
  hydrate: (index: any, raw: any) => unknown;
  idParts: readonly string[];
  points: ReturnType<typeof createXyFixture>["points"];
  raw: (index: any) => unknown;
  size: number;
  sizeLabel: string;
  validate: (output: any) => void;
  workload: string;
  wrapper: (index: RustWasmVizDensityIndex) => unknown;
}): BenchmarkCase[] {
  return [
    {
      category: "xy",
      id: createCaseId([...options.idParts, "raw"]),
      implementation: "viz-engine wasm raw",
      notes: ["Benchmark-only direct call into the generated WASM density index."],
      prepare: () => new RustWasmVizDensityIndex(options.points),
      run: (prepared) => options.raw(prepared),
      size: options.sizeLabel,
      sizeValue: options.size,
      validate: (prepared) => options.validate(options.raw(prepared)),
      workload: options.workload,
    },
    {
      category: "xy",
      id: createCaseId([...options.idParts, "hydration-only"]),
      implementation: "viz-engine wasm hydration-only",
      notes: ["Benchmark-only wrapper hydration over a previously captured raw WASM result."],
      prepare: () => {
        const index = new RustWasmVizDensityIndex(options.points) as any;
        return { index, raw: options.raw(index) };
      },
      run: (prepared) => {
        const { index, raw } = prepared as { index: any; raw: any };
        return options.hydrate(index, raw);
      },
      size: options.sizeLabel,
      sizeValue: options.size,
      validate: (prepared) => {
        const { index, raw } = prepared as { index: any; raw: any };
        options.validate(options.hydrate(index, raw));
      },
      workload: options.workload,
    },
    {
      category: "xy",
      id: createCaseId([...options.idParts, "wrapper-total"]),
      implementation: "viz-engine wasm wrapper-total",
      notes: ["Existing public wrapper path for comparison with raw and hydration-only timings."],
      prepare: () => new RustWasmVizDensityIndex(options.points),
      run: (prepared) => options.wrapper(prepared as RustWasmVizDensityIndex),
      size: options.sizeLabel,
      sizeValue: options.size,
      validate: (prepared) =>
        options.validate(options.wrapper(prepared as RustWasmVizDensityIndex)),
      workload: options.workload,
    },
  ];
}

function normalizeBoundaryMetrics(metrics: unknown) {
  return metrics instanceof Map ? Object.fromEntries(metrics) : metrics;
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
