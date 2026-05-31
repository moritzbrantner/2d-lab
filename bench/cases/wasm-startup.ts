import { RustWasmVizDensityIndex } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createXyFixture } from "../fixtures/xy";
import { assertPositive, createCaseId } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";

export function createWasmStartupCases(config: BenchmarkConfig): BenchmarkCase[] {
  const size = config.mode === "quick" ? 1_000 : 10_000;
  const fixture = createXyFixture(size, config.settings.seed);
  const sizeLabel = formatSize(size);

  return [
    {
      category: "startup",
      id: createCaseId(["startup", "wasm-index-construction", sizeLabel]),
      implementation: "viz-engine wasm",
      notes: ["Measures Rust/WASM density index construction in-process."],
      prepare: () => fixture.points,
      run: () => new RustWasmVizDensityIndex(fixture.points),
      size: sizeLabel,
      sizeValue: size,
      validate: () => {
        const index = new RustWasmVizDensityIndex(fixture.points);
        assertPositive(index.getSeriesBounds()?.maxX ?? 0, "WASM bounds maxX");
      },
      workload: "wasm/index-construction",
    },
    {
      category: "startup",
      id: createCaseId(["startup", "wasm-first-query", sizeLabel]),
      implementation: "viz-engine wasm",
      notes: [
        "Measures construction plus the first binned query; module import is not isolated per iteration.",
      ],
      prepare: () => fixture.points,
      run: () => {
        const index = new RustWasmVizDensityIndex(fixture.points);
        return index.getChartSeries({
          targetBinCount: 256,
          valueMode: "average",
          xDomain: fixture.domains.full,
        });
      },
      size: sizeLabel,
      sizeValue: size,
      validate: () => {
        const index = new RustWasmVizDensityIndex(fixture.points);
        const output = index.getChartSeries({ targetBinCount: 256, xDomain: fixture.domains.full });
        assertPositive(output.summary.sampleCount, "WASM first query sample count");
      },
      workload: "wasm/first-query",
    },
    {
      category: "startup",
      id: createCaseId(["startup", "wasm-warm-query", sizeLabel]),
      implementation: "viz-engine wasm",
      notes: ["Measures repeated warm calls against an existing Rust/WASM density index."],
      prepare: () => new RustWasmVizDensityIndex(fixture.points),
      run: (prepared) =>
        (prepared as RustWasmVizDensityIndex).getChartSeries({
          targetBinCount: 256,
          valueMode: "average",
          xDomain: fixture.domains.full,
        }),
      size: sizeLabel,
      sizeValue: size,
      validate: (prepared) => {
        const output = (prepared as RustWasmVizDensityIndex).getChartSeries({
          targetBinCount: 256,
          xDomain: fixture.domains.full,
        });
        assertPositive(output.summary.sampleCount, "WASM warm query sample count");
      },
      workload: "wasm/warm-query",
    },
  ];
}
