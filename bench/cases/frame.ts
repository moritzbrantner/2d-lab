import { createPreparedFrame } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createXyFixture } from "../fixtures/xy";
import { assert, assertPositive, createCaseId } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";
import type { VizBackendOption, VizFrameFormat, VizLayer } from "../../src/types";

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
      },
      {
        bucketCount: 256,
        datasetId: "dataset",
        kind: "histogram",
      },
      {
        datasetId: "dataset",
        kind: "heatmap",
        xBinCount: 96,
        yBinCount: 48,
      },
      {
        datasetId: "dataset",
        kind: "rolling-series",
        statistic: "mean",
        windowSize: 64,
      },
    ];

    const backends =
      config.runtime === "browser" ? (["js", "auto"] as const) : (["js", "wasm", "auto"] as const);

    for (const frameFormat of ["objects", "typed"] as const) {
      for (const backend of backends) {
        cases.push(createFirstFrameCase(backend, frameFormat, sizeLabel, size, fixture, layers));
        cases.push(
          createRepeatedFrameCase(
            backend,
            frameFormat,
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
            frameFormat,
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
  frameFormat: VizFrameFormat,
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  return {
    category: "frame",
    id: createCaseId(["frame", frameFormat, "first", sizeLabel, backend]),
    implementation: `viz-engine ${backend}`,
    prepare: () => null,
    run: () =>
      createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
          frameFormat,
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
          frameFormat,
          viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
        },
        layers,
      }).compute();
      assertPositive(frame.layers.length, "first frame layer count");
      assertFrameFormat(frame, frameFormat);
    },
    workload: `computeFrame/${frameFormat}/first`,
  };
}

function createRepeatedFrameCase(
  backend: VizBackendOption,
  frameFormat: VizFrameFormat,
  mode: "same-viewport" | "shifting-viewport",
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  let offset = 0;

  return {
    category: "frame",
    id: createCaseId(["frame", frameFormat, mode, sizeLabel, backend]),
    implementation: `viz-engine ${backend}`,
    prepare: () =>
      createPreparedFrame({
        backend,
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
          frameFormat,
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
        frameFormat,
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
      assertFrameFormat(frame, frameFormat);
    },
    workload: `computeFrame/${frameFormat}/${mode}`,
  };
}

function assertFrameFormat(
  frame: ReturnType<ReturnType<typeof createPreparedFrame>["compute"]>,
  frameFormat: VizFrameFormat,
) {
  if (frameFormat === "objects") {
    return;
  }

  for (const layer of frame.layers) {
    if (
      layer.kind === "binned-series" ||
      layer.kind === "histogram" ||
      layer.kind === "heatmap" ||
      layer.kind === "rolling-series"
    ) {
      assert(
        "typedSeries" in layer ||
          "typedHistogram" in layer ||
          "typedHeatmap" in layer ||
          "typedRollingSeries" in layer,
        "typed frame layer",
      );
    }
  }
}
