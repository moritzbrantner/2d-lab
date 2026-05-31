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

const financeBars = [
  { close: 100, high: 101, low: 98, open: 99, timestamp: 1, volume: 10 },
  { close: 110, high: 112, low: 99, open: 100, timestamp: 2, volume: 20 },
  { close: 105, high: 111, low: 104, open: 110, timestamp: 3, volume: 30 },
  { close: 120, high: 122, low: 103, open: 105, timestamp: 4, volume: 40 },
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

  test("reuses repeated layer output and clears cache on layer changes", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    const layerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });
    const options = { viewport: { height: 320, width: 800, xDomain: [0, 40] as [number, number] } };
    const firstLayer = engine.computeFrame(options).layers[0];
    const secondLayer = engine.computeFrame(options).layers[0];

    expect(secondLayer).toBe(firstLayer);

    engine.removeLayer(layerId);
    const nextLayerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });
    const afterChangeLayer = engine.computeFrame(options).layers[0];

    expect(nextLayerId).toBe("layer-2");
    expect(afterChangeLayer).not.toBe(firstLayer);
  });

  test("returns typed cartesian frames by default and hydrates object layers explicitly", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });

    const frame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
    const layer = frame.layers[0];

    expect(layer).toMatchObject({ kind: "binned-series", outputMode: "compact" });
    if (layer?.kind === "binned-series" && "typedSeries" in layer) {
      expect(layer.typedSeries).toBe(layer.compactSeries);
      expect([...layer.typedSeries.pointCount]).toEqual([1, 1, 1, 1, 1]);
      expect("rows" in layer).toBe(false);
    } else {
      throw new Error("Expected typed binned-series layer.");
    }

    const hydrated = engine.hydrateFrame(frame);
    expect(hydrated.layers[0]).toMatchObject({ kind: "binned-series" });
    expect(
      hydrated.layers[0]?.kind === "binned-series" ? hydrated.layers[0].rows[0] : null,
    ).toMatchObject({ value: 2, x: 4 });
  });

  test("accepts typed xy datasets", () => {
    const objectEngine = createVizEngine({ backend: "js" });
    const typedEngine = createVizEngine({ backend: "js" });
    const objectDatasetId = objectEngine.addDataset({ kind: "xy", points });
    const typedDatasetId = typedEngine.addDataset({
      ids: ["a", "b", "c", "d", "e"],
      kind: "xy",
      x: new Float64Array(points.map((point) => point.x)),
      y: new Float64Array(points.map((point) => point.y)),
    });

    objectEngine.addLayer({
      datasetId: objectDatasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });
    typedEngine.addLayer({
      datasetId: typedDatasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });

    const objectLayer = objectEngine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    }).layers[0];
    const typedLayer = typedEngine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    }).layers[0];

    expect(
      objectLayer?.kind === "binned-series" && "typedSeries" in objectLayer
        ? [...objectLayer.typedSeries.y]
        : [],
    ).toEqual(
      typedLayer?.kind === "binned-series" && "typedSeries" in typedLayer
        ? [...typedLayer.typedSeries.y]
        : [],
    );
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
      sourcePointId: null,
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

  test("computes finance candle, line, and returns layers", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      bars: financeBars,
      instrument: { assetClass: "equity", currency: "USD", symbol: "AAPL" },
      kind: "finance-ohlcv",
    });

    engine.addLayer({
      datasetId,
      kind: "finance-candles",
      targetBarCount: 2,
      xDomain: [1, 4],
    });
    engine.addLayer({
      datasetId,
      kind: "finance-line",
      value: "close",
      xDomain: [1, 4],
    });
    engine.addLayer({
      datasetId,
      kind: "finance-returns",
      method: "simple",
      xDomain: [1, 4],
    });

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { height: 320, width: 800, xDomain: [1, 4] },
    });

    expect(frame.layers).toHaveLength(3);
    expect(frame.layers[0]).toMatchObject({
      bars: [
        { close: 110, high: 112, low: 98, open: 99, timestamp: 1, volume: 30 },
        { close: 120, high: 122, low: 103, open: 110, timestamp: 3, volume: 70 },
      ],
      kind: "finance-candles",
    });
    expect(frame.layers[1]).toMatchObject({
      kind: "finance-line",
      rows: [
        { value: 100, x: 1 },
        { value: 110, x: 2 },
        { value: 105, x: 3 },
        { value: 120, x: 4 },
      ],
    });
    expect(frame.layers[2]).toMatchObject({ kind: "finance-returns" });
    const returnLayer = frame.layers[2];
    expect(returnLayer.kind).toBe("finance-returns");
    if (returnLayer.kind === "finance-returns") {
      expect(returnLayer.rows.map((row) => row.x)).toEqual([2, 3, 4]);
      expect(returnLayer.rows[0]?.value).toBeCloseTo(0.1);
      expect(returnLayer.rows[1]?.value).toBeCloseTo(-0.045454545454545414);
      expect(returnLayer.rows[2]?.value).toBeCloseTo(0.1428571428571428);
    }
  });

  test("reports diagnostics for incompatible finance usage", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    engine.addLayer({ datasetId, kind: "finance-candles", xDomain: [1, 4] });

    const wrongDatasetFrame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [1, 4] },
    });

    expect(wrongDatasetFrame.layers).toHaveLength(0);
    expect(wrongDatasetFrame.stats.diagnostics[0]).toMatchObject({
      code: "incompatible-layer-dataset",
    });

    const financeEngine = createVizEngine({ backend: "js" });
    const financeDatasetId = financeEngine.addDataset({
      bars: financeBars,
      instrument: { symbol: "AAPL" },
      kind: "finance-ohlcv",
    });
    financeEngine.addLayer({
      datasetId: financeDatasetId,
      kind: "finance-candles",
      xDomain: [1, 4],
    });

    const wrongViewportFrame = financeEngine.computeFrame({
      viewport: {
        bounds: [-10, -10, 10, 10],
        center: [0, 0],
        display: "flat",
        height: 320,
        kind: "geo",
        width: 800,
        zoom: 2,
      },
    });

    expect(wrongViewportFrame.layers).toHaveLength(0);
    expect(wrongViewportFrame.stats.diagnostics[0]).toMatchObject({
      code: "incompatible-viewport",
    });
  });
});
