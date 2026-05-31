import { getDownsampledCloseSeries } from "../adapters/downsample";
import { JsVizFinanceIndex, WasmVizFinanceIndex } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createFinanceFixture } from "../fixtures/finance";
import {
  aggregateOhlcvForBenchmark,
  assertPositive,
  createCaseId,
  simpleReturnSeries,
} from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";

export function createFinanceCases(config: BenchmarkConfig): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const size of config.financeSizes) {
    const fixture = createFinanceFixture(size, config.settings.seed);
    const sizeLabel = formatSize(size);
    const downsampleQueries = [
      { name: "full-500", targetBarCount: 500, xDomain: fixture.domains.full },
      { name: "full-2000", targetBarCount: 2_000, xDomain: fixture.domains.full },
      { name: "last-500", targetBarCount: 500, xDomain: fixture.domains.last },
    ] as const;
    const returnQueries = [
      {
        method: "simple" as const,
        name: "simple-1000",
        targetPointCount: 1_000,
        xDomain: fixture.domains.full,
      },
      {
        method: "log" as const,
        name: "log-1000",
        targetPointCount: 1_000,
        xDomain: fixture.domains.full,
      },
    ] as const;

    for (const query of downsampleQueries) {
      for (const implementation of ["js", "wasm-fallback"] as const) {
        cases.push({
          category: "finance",
          id: createCaseId(["finance", "downsample", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          notes:
            implementation === "wasm-fallback"
              ? ["Finance WASM class currently delegates to the JS implementation."]
              : [],
          prepare: () =>
            implementation === "js"
              ? new JsVizFinanceIndex(fixture.dataset)
              : new WasmVizFinanceIndex(fixture.dataset),
          run: (prepared) =>
            (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getDownsampledBars(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getDownsampledBars(
              query,
            );
            assertPositive(output.length, "viz-engine downsampled bar count");
            assertPositive(output[0]!.open, "first open");
            assertPositive(output[output.length - 1]!.close, "last close");
          },
          workload: `ohlcv-downsample/${query.name}`,
        });
      }

      for (const implementation of ["js", "wasm-fallback"] as const) {
        cases.push({
          category: "finance",
          id: createCaseId([
            "finance",
            "downsample-compact",
            query.name,
            sizeLabel,
            implementation,
          ]),
          implementation: `viz-engine ${implementation} compact`,
          notes:
            implementation === "wasm-fallback"
              ? ["Finance WASM class currently delegates to the JS implementation."]
              : [],
          prepare: () =>
            implementation === "js"
              ? new JsVizFinanceIndex(fixture.dataset)
              : new WasmVizFinanceIndex(fixture.dataset),
          run: (prepared) =>
            (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getCompactDownsampledBars(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizFinanceIndex | WasmVizFinanceIndex
            ).getCompactDownsampledBars(query);
            assertPositive(output.summary.barCount, "compact downsampled bar count");
            assertPositive(output.open[0] ?? 0, "compact first open");
          },
          workload: `ohlcv-downsample-compact/${query.name}`,
        });
      }

      cases.push({
        category: "finance",
        external: true,
        id: createCaseId(["finance", "downsample", query.name, sizeLabel, "downsample-lttb"]),
        implementation: "downsample-lttb",
        notes: ["Visual close-price downsampling, not OHLC semantic aggregation."],
        prepare: () => fixture.bars,
        run: () => getDownsampledCloseSeries(fixture.bars, query),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const output = getDownsampledCloseSeries(fixture.bars, query);
          assertPositive(output.length, "downsample LTTB point count");
        },
        workload: `ohlcv-downsample/${query.name}`,
      });

      cases.push({
        category: "finance",
        external: true,
        id: createCaseId(["finance", "downsample", query.name, sizeLabel, "local-ohlc-aggregate"]),
        implementation: "local-ohlc-aggregate",
        notes: ["Local semantic OHLC bucket aggregation baseline."],
        prepare: () =>
          fixture.bars.filter(
            (bar) => bar.timestamp >= query.xDomain[0] && bar.timestamp <= query.xDomain[1],
          ),
        run: (prepared) =>
          aggregateOhlcvForBenchmark(prepared as typeof fixture.bars, query.targetBarCount),
        size: sizeLabel,
        sizeValue: size,
        validate: (prepared) => {
          const output = aggregateOhlcvForBenchmark(
            prepared as typeof fixture.bars,
            query.targetBarCount,
          );
          assertPositive(output.length, "local OHLC aggregate count");
          assertPositive(output[0]!.high - output[0]!.low, "high-low range");
        },
        workload: `ohlcv-downsample/${query.name}`,
      });
    }

    for (const query of returnQueries) {
      for (const implementation of ["js", "wasm-fallback"] as const) {
        cases.push({
          category: "finance",
          id: createCaseId(["finance", "returns", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          notes:
            implementation === "wasm-fallback"
              ? ["Finance WASM class currently delegates to the JS implementation."]
              : [],
          prepare: () =>
            implementation === "js"
              ? new JsVizFinanceIndex(fixture.dataset)
              : new WasmVizFinanceIndex(fixture.dataset),
          run: (prepared) =>
            (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getReturns(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getReturns(query);
            assertPositive(output.summary.sampleCount, "viz-engine returns sample count");
          },
          workload: `returns/${query.name}`,
        });
      }

      for (const implementation of ["js", "wasm-fallback"] as const) {
        cases.push({
          category: "finance",
          id: createCaseId(["finance", "returns-compact", query.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation} compact`,
          notes:
            implementation === "wasm-fallback"
              ? ["Finance WASM class currently delegates to the JS implementation."]
              : [],
          prepare: () =>
            implementation === "js"
              ? new JsVizFinanceIndex(fixture.dataset)
              : new WasmVizFinanceIndex(fixture.dataset),
          run: (prepared) =>
            (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getCompactReturns(query),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (prepared as JsVizFinanceIndex | WasmVizFinanceIndex).getCompactReturns(
              query,
            );
            assertPositive(output.summary.sampleCount, "compact returns sample count");
          },
          workload: `returns-compact/${query.name}`,
        });
      }

      cases.push({
        category: "finance",
        external: true,
        id: createCaseId(["finance", "returns", query.name, sizeLabel, "local-return-baseline"]),
        implementation: "local-return-baseline",
        notes: ["Direct simple/log close-price return baseline."],
        prepare: () => fixture.bars,
        run: () => simpleReturnSeries(fixture.bars, query),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const output = simpleReturnSeries(fixture.bars, query);
          assertPositive(output.points.length, "local return point count");
        },
        workload: `returns/${query.name}`,
      });
    }
  }

  return cases;
}
