import { createPreparedFrame, createVizEngine } from "../adapters/viz-engine";
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

    cases.push(createFilteredFrameCase(sizeLabel, size, fixture, layers));
    cases.push(createHitTestFrameCase(sizeLabel, size, fixture, layers));
  }

  return cases;
}

function createFilteredFrameCase(
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  return {
    category: "frame",
    id: createCaseId(["frame", "typed", "filtered-layer", sizeLabel, "js"]),
    implementation: "viz-engine js",
    prepare: () => {
      const engine = createVizEngine({ backend: "js" });
      const datasetId = engine.addDataset({ kind: "xy", points: fixture.points });
      const layerIds = layers.map((layer) => engine.addLayer({ ...layer, datasetId }));

      return { engine, layerId: layerIds[0]! };
    },
    run: (prepared) => {
      const { engine, layerId } = prepared as {
        engine: ReturnType<typeof createVizEngine>;
        layerId: string;
      };

      return engine.computeFrame({
        frameFormat: "typed",
        layerIds: [layerId],
        viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
      });
    },
    size: sizeLabel,
    sizeValue: size,
    validate: (prepared) => {
      const output = (
        prepared as {
          engine: ReturnType<typeof createVizEngine>;
          layerId: string;
        }
      ).engine.computeFrame({
        frameFormat: "typed",
        layerIds: [(prepared as { layerId: string }).layerId],
        viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
      });
      assert(output.layers.length === 1, "filtered frame layer count");
    },
    workload: "computeFrame/typed/filtered-layer",
  };
}

function createHitTestFrameCase(
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createXyFixture>,
  layers: VizLayer[],
): BenchmarkCase {
  return {
    category: "frame",
    id: createCaseId(["frame", "hit-test", "typed", sizeLabel, "js"]),
    implementation: "viz-engine js",
    prepare: () => {
      const prepared = createPreparedFrame({
        backend: "js",
        dataset: { kind: "xy", points: fixture.points },
        frameOptions: {
          frameFormat: "typed",
          viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
        },
        layers,
      });

      return {
        engine: prepared.engine,
        frame: prepared.compute(),
        viewport: { height: 360, width: 960, xDomain: fixture.domains.viewport },
      };
    },
    run: (prepared) => {
      const context = prepared as {
        engine: ReturnType<typeof createVizEngine>;
        frame: ReturnType<ReturnType<typeof createPreparedFrame>["compute"]>;
        viewport: { height: number; width: number; xDomain: [number, number] };
      };

      return context.engine.hitTest({
        frame: context.frame,
        viewport: context.viewport,
        x: 480,
        y: 180,
      });
    },
    size: sizeLabel,
    sizeValue: size,
    validate: (prepared) => {
      const context = prepared as {
        engine: ReturnType<typeof createVizEngine>;
        frame: ReturnType<ReturnType<typeof createPreparedFrame>["compute"]>;
        viewport: { height: number; width: number; xDomain: [number, number] };
      };
      assert(
        context.engine.hitTest({
          frame: context.frame,
          viewport: context.viewport,
          x: 480,
          y: 180,
        }) != null,
        "hit test result",
      );
    },
    workload: "hitTest/typed/cartesian",
  };
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
