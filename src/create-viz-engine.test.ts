import { describe, expect, test } from "vitest";

import { createVizEngine } from "./create-viz-engine";

import type { VizSeriesPoint } from "./types";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2 },
  { id: "b", x: 10, y: 4 },
  { id: "c", x: 20, y: 8 },
  { id: "d", x: 30, y: 16 },
  { id: "e", x: 40, y: 32 },
];

describe("createVizEngine", () => {
  test("creates deterministic ids and tracks lifecycle counts", () => {
    const engine = createVizEngine({ backend: "js" });
    const firstDatasetId = engine.addDataset({ kind: "xy", points });
    const secondDatasetId = engine.addDataset({ kind: "xy", points: points.slice(0, 2) });
    const firstLayerId = engine.addLayer({
      datasetId: firstDatasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });
    const secondLayerId = engine.addLayer({
      datasetId: secondDatasetId,
      kind: "histogram",
      bucketCount: 2,
    });

    expect([firstDatasetId, secondDatasetId, firstLayerId, secondLayerId]).toEqual([
      "dataset-1",
      "dataset-2",
      "layer-1",
      "layer-2",
    ]);
    expect(engine.getDatasetCount()).toBe(2);
    expect(engine.getLayerCount()).toBe(2);

    engine.removeLayer(firstLayerId);
    expect(engine.getLayerCount()).toBe(1);

    engine.removeDataset(secondDatasetId);
    expect(engine.getDatasetCount()).toBe(1);
    expect(engine.getLayerCount()).toBe(0);
  });

  test("invalidates frames when layers or datasets change", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    const layerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });

    expect(
      engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).layers,
    ).toHaveLength(1);

    engine.removeLayer(layerId);
    expect(
      engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).layers,
    ).toHaveLength(0);
  });

  test("computes hit tests lazily when a viewport is supplied", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    const layerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });

    expect(engine.hitTest({ x: 400, y: 120 })).toBeNull();
    expect(
      engine.hitTest({
        viewport: { height: 320, width: 800, xDomain: [0, 40] },
        x: 400,
        y: 120,
      }),
    ).toMatchObject({
      datasetId,
      layerId,
      pointCount: 1,
      sourcePointId: "c",
    });
  });

  test("lets multiple layers share one dataset", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({ datasetId, kind: "binned-series", targetBinCount: 4, xDomain: [0, 40] });
    engine.addLayer({ bucketCount: 4, datasetId, kind: "histogram" });
    engine.addLayer({ datasetId, kind: "heatmap", xBinCount: 4, xDomain: [0, 40], yBinCount: 4 });

    const frame = engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } });

    expect(engine.getDatasetCount()).toBe(1);
    expect(frame.layers).toHaveLength(3);
    expect(new Set(frame.layers.map((layer) => layer.datasetId))).toEqual(new Set([datasetId]));
  });

  test("reports selected backend stats", () => {
    const jsEngine = createVizEngine({ backend: "js" });
    const wasmEngine = createVizEngine({ backend: "wasm" });

    for (const engine of [jsEngine, wasmEngine]) {
      const datasetId = engine.addDataset({ kind: "xy", points });
      engine.addLayer({ datasetId, kind: "binned-series", targetBinCount: 2, xDomain: [0, 40] });
    }

    expect(
      jsEngine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).stats,
    ).toMatchObject({ backend: "js", backendImplementation: "js" });
    expect(
      wasmEngine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).stats,
    ).toMatchObject({ backend: "wasm", backendImplementation: "rust-viz-engine-wasm" });
  });
});
