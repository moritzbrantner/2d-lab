import { createPreparedFrame } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createXyFixture } from "../fixtures/xy";
import { assert, assertPositive, createCaseId } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";
import type { VizBackendOption, VizComputeFrameOptions, VizLayer } from "../../src/types";

export function createFrameCases(config: BenchmarkConfig): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const size of config.xySizes) {
    const fixture = createXyFixture(size, config.settings.seed);
    const sizeLabel = formatSize(size);
    const layers: VizLayer[] = [
      {
        datasetId: "dataset",
        kind: "binned-series",
        targetBinCount: 512,
        valueMode: "average",
        xDomain: fixture.domains.viewport,
      },
      {
        bucketCount: 256,
        datasetId: "dataset",
        kind: "histogram",
        xDomain: fixture.domains.viewport,
      },
      {
        datasetId: "dataset",
        kind: "heatmap",
        xBinCount: 96,
        xDomain: fixture.domains.viewport,
        yBinCount: 48,
      },
      {
        datasetId: "dataset",
        kind: "rolling-series",
        statistic: "mean",
        windowSize: 64,
        xDomain: fixture.domains.viewport,
      },
    ];

    for (const outputMode of ["object", "compact"] as const) {
      for (const backend of ["js", "wasm", "auto"] as const) {
        cases.push(createFirstFrameCase(backend, outputMode, sizeLabel, size, fixture, layers));
        cases.push(
          createRepeatedFrameCase(
            backend,
            outputMode,
            "same-viewport",
            sizeLabel,
            size,
            fixture,
            layers,
          ),
        );
        cases.push(
          createRepeatedFrameCase(
            backend,
            outputMode,
            "shifting-viewport",
            sizeLabel,
            size,
            fixture,
            layers,
          ),
        );
      }
    }
  }

  return cases;
}

function createFirstFrameCase(
  backend: VizBackendOption,
  outputMode: NonNullable<VizComputeFrameOptions["outputMode"]>,
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  return {
    category: "frame",
    id: createCaseId(["frame", outputMode, "first", sizeLabel, backend]),
    implementation: `viz-engine ${backend}`,
    prepare: () => null,
    run: () =>
      createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
          outputMode,
          viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
        },
        layers,
      }).compute(),
    size: sizeLabel,
    sizeValue: size,
    validate: () => {
      const frame = createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
          outputMode,
          viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
        },
        layers,
      }).compute();
      assertPositive(frame.layers.length, "first frame layer count");
      assertFrameOutputMode(frame, outputMode);
    },
    workload: `computeFrame/${outputMode}/first`,
  };
}

function createRepeatedFrameCase(
  backend: VizBackendOption,
  outputMode: NonNullable<VizComputeFrameOptions["outputMode"]>,
  mode: "same-viewport" | "shifting-viewport",
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  let offset = 0;

  return {
    category: "frame",
    id: createCaseId(["frame", outputMode, mode, sizeLabel, backend]),
    implementation: `viz-engine ${backend}`,
    prepare: () =>
      createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
          outputMode,
          viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
        },
        layers,
      }),
    run: (prepared) => {
      const frame = prepared as ReturnType<typeof createPreparedFrame>;
      if (mode === "same-viewport") {
        return frame.compute();
      }

      const span = fixture.domains.viewport[1] - fixture.domains.viewport[0];
      const start =
        fixture.domains.full[0] + ((offset++ % 20) / 20) * (fixture.domains.full[1] - span);
      return frame.engine.computeFrame({
        outputMode,
        viewport: {
          height: 360,
          width: 960,
          xDomain: [start, start + span],
        },
      });
    },
    size: sizeLabel,
    sizeValue: size,
    validate: (prepared) => {
      const frame = (prepared as ReturnType<typeof createPreparedFrame>).compute();
      assertPositive(frame.layers.length, "repeated frame layer count");
      assertFrameOutputMode(frame, outputMode);
    },
    workload: `computeFrame/${outputMode}/${mode}`,
  };
}

function assertFrameOutputMode(
  frame: ReturnType<ReturnType<typeof createPreparedFrame>["compute"]>,
  outputMode: NonNullable<VizComputeFrameOptions["outputMode"]>,
) {
  if (outputMode === "object") {
    return;
  }

  for (const layer of frame.layers) {
    if (
      layer.kind === "binned-series" ||
      layer.kind === "histogram" ||
      layer.kind === "heatmap" ||
      layer.kind === "rolling-series"
    ) {
      assert("outputMode" in layer && layer.outputMode === "compact", "compact frame layer");
    }
  }
}
