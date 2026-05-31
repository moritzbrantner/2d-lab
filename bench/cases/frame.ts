import { createPreparedFrame } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createXyFixture } from "../fixtures/xy";
import { assertPositive, createCaseId } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";
import type { VizBackendOption, VizLayer } from "../../src/types";

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

    for (const backend of ["js", "wasm", "auto"] as const) {
      cases.push(createFirstFrameCase(backend, sizeLabel, size, fixture, layers));
      cases.push(
        createRepeatedFrameCase(backend, "same-viewport", sizeLabel, size, fixture, layers),
      );
      cases.push(
        createRepeatedFrameCase(backend, "shifting-viewport", sizeLabel, size, fixture, layers),
      );
    }
  }

  return cases;
}

function createFirstFrameCase(
  backend: VizBackendOption,
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  return {
    category: "frame",
    id: createCaseId(["frame", "first", sizeLabel, backend]),
    implementation: `viz-engine ${backend}`,
    prepare: () => null,
    run: () =>
      createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
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
          viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
        },
        layers,
      }).compute();
      assertPositive(frame.layers.length, "first frame layer count");
    },
    workload: "computeFrame/first",
  };
}

function createRepeatedFrameCase(
  backend: VizBackendOption,
  mode: "same-viewport" | "shifting-viewport",
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  let offset = 0;

  return {
    category: "frame",
    id: createCaseId(["frame", mode, sizeLabel, backend]),
    implementation: `viz-engine ${backend}`,
    prepare: () =>
      createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
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
    },
    workload: `computeFrame/${mode}`,
  };
}
