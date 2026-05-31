import { afterEach, describe, expect, test, vi } from "vitest";

import { RustWasmVizDensityIndex } from "./backend/rust-wasm-density-index";
import { WasmVizGeoPointIndex } from "./backend/wasm-geo-index";
import { createVizEngine } from "./create-viz-engine";
import { createVizEngineBackend } from "./js-backend";
import { computeVizRenderFrame, createVizRenderRows } from "./render-frame";

import type { VizDensitySeries, VizEngineDatasetRecord, VizLayer, VizSeriesPoint } from "./types";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2, metrics: { count: 1 } },
  { id: "b", x: 10, y: 4, metrics: { count: 1 } },
  { id: "c", x: 20, y: 8, metrics: { count: 1 } },
  { id: "d", x: 30, y: 16, metrics: { count: 1 } },
  { id: "e", x: 40, y: 32, metrics: { count: 1 } },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computeVizRenderFrame", () => {
  test("renders binned-series, histogram, and heatmap layers", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 4,
      valueMode: "average",
      xDomain: [0, 40],
    });
    engine.addLayer({ bucketCount: 4, datasetId, kind: "histogram", xDomain: [0, 40] });
    engine.addLayer({
      datasetId,
      kind: "heatmap",
      xBinCount: 4,
      xDomain: [0, 40],
      yBinCount: 4,
      yDomain: [0, 40],
    });

    const frame = engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } });

    expect(frame.stats).toMatchObject({
      backend: "js",
      backendImplementation: "js",
      datasetCount: 1,
      diagnostics: [],
      layerCount: 3,
    });
    expect(frame.layers.map((layer) => layer.kind)).toEqual([
      "binned-series",
      "histogram",
      "heatmap",
    ]);
    expect(frame.layers[0]).toMatchObject({ bounds: [0, 2, 40, 24], datasetId });
    expect(frame.layers[1]).toMatchObject({ bounds: [2, 0, 32, 3], datasetId });
    expect(frame.layers[2]).toMatchObject({ bounds: [0, 0, 40, 40], datasetId });
  });

  test("renders rolling-series layers from the Rust-backed density API surface", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      alpha: 0.5,
      datasetId,
      kind: "rolling-series",
      minPeriods: 2,
      statistic: "mean",
      windowSize: 3,
      xDomain: [0, 40],
    });

    const frame = engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } });
    const layer = frame.layers[0];

    expect(layer).toMatchObject({
      bounds: [10, 3, 40, 56 / 3],
      datasetId,
      kind: "rolling-series",
      statistic: "mean",
    });
    expect(layer?.kind === "rolling-series" ? layer.rows.map((row) => row.value) : []).toEqual([
      null,
      3,
      14 / 3,
      28 / 3,
      56 / 3,
    ]);
  });

  test("creates render rows for every value mode", () => {
    const sample = {
      averageY: 4,
      firstPoint: { id: "a", label: "A", sourceIndex: 0, x: 0, y: 4 },
      firstPointIndex: 0,
      index: 0,
      lastPoint: null,
      lastPointIndex: null,
      maxY: 6,
      metrics: { count: 2 },
      minY: 2,
      pointCount: 2,
      sumY: 8,
      x: 5,
      x0: 0,
      x1: 10,
      y: 4,
    };
    const series = {
      bins: [sample],
      samples: [sample],
      summary: {
        binCount: 1,
        metrics: { count: 2 },
        pointCount: 2,
        sampleCount: 1,
        valueMode: "average" as const,
        xDomain: [0, 10] as [number, number],
      },
    } satisfies VizDensitySeries;

    expect(
      ["average", "count", "max", "min", "sum"].map(
        (mode) => createVizRenderRows(series, mode as never)[0]?.value,
      ),
    ).toEqual([4, 2, 6, 2, 8]);
    expect(createVizRenderRows(series)[0]).toMatchObject({
      average: 4,
      label: "A",
      metrics: { count: 2 },
      pointCount: 2,
      sum: 8,
    });
  });

  test("reports missing and incompatible layer diagnostics", () => {
    const backend = createVizEngineBackend("js");
    const datasets = new Map<string, VizEngineDatasetRecord>([
      [
        "geojson-dataset",
        {
          dataset: {
            featureCollection: { features: [], type: "FeatureCollection" },
            kind: "geojson",
          },
          index: backend.createIndex({
            featureCollection: { features: [], type: "FeatureCollection" },
            kind: "geojson",
          }),
        },
      ],
    ]);
    const layers = new Map<string, VizLayer>([
      ["missing-layer", { bucketCount: 2, datasetId: "missing-dataset", kind: "histogram" }],
      [
        "incompatible-layer",
        { datasetId: "geojson-dataset", kind: "binned-series", targetBinCount: 2, xDomain: [0, 1] },
      ],
    ]);

    const frame = computeVizRenderFrame(datasets, layers, backend, {
      viewport: { height: 100, width: 100, xDomain: [0, 1] },
    });

    expect(frame.layers).toEqual([]);
    expect(frame.stats.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "missing-dataset",
      "incompatible-layer-dataset",
    ]);
  });

  test("computes frame timing without a global performance object", () => {
    vi.stubGlobal("performance", undefined);
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 2,
      xDomain: [0, 40],
    });

    const frame = engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } });

    expect(frame.stats.computeMs).toBeGreaterThanOrEqual(0);
    expect(frame.layers).toHaveLength(1);
  });

  test("reports incompatible viewport diagnostics", () => {
    const cartesianEngine = createVizEngine({ backend: "js" });
    const xyDatasetId = cartesianEngine.addDataset({ kind: "xy", points });
    cartesianEngine.addLayer({
      datasetId: xyDatasetId,
      kind: "binned-series",
      targetBinCount: 2,
      xDomain: [0, 40],
    });

    expect(
      cartesianEngine.computeFrame({
        viewport: {
          bounds: [12, 51, 14, 53],
          center: [13, 52],
          display: "flat",
          height: 100,
          kind: "geo",
          width: 100,
          zoom: 1,
        },
      }).stats.diagnostics[0],
    ).toMatchObject({ code: "incompatible-viewport", severity: "warning" });

    const geoEngine = createVizEngine({ backend: "js" });
    const geoDatasetId = geoEngine.addDataset({
      kind: "geo-points",
      points: [{ latitude: 52, longitude: 13 }],
    });
    geoEngine.addLayer({ datasetId: geoDatasetId, kind: "geo-clusters" });

    expect(
      geoEngine.computeFrame({ viewport: { height: 100, width: 100, xDomain: [0, 1] } }).stats
        .diagnostics[0],
    ).toMatchObject({ code: "incompatible-viewport", severity: "warning" });
  });

  test("renders geo clusters, points, heat, geojson, and flows", () => {
    const engine = createVizEngine({ backend: "js" });
    const geoDatasetId = engine.addDataset({
      kind: "geo-points",
      points: [
        { id: "a", latitude: 52, longitude: 13, metrics: { demand: 2, weight: 1 } },
        { id: "b", latitude: 52.0001, longitude: 13.0001, metrics: { demand: 3, weight: -1 } },
        { id: "c", latitude: 52.0002, longitude: 13.0002, metrics: { demand: 0, weight: 5 } },
      ],
    });
    const geoJsonDatasetId = engine.addDataset({
      featureCollection: {
        features: [
          {
            geometry: { coordinates: [13, 52], type: "Point" },
            id: "shape",
            properties: { name: "Shape" },
            type: "Feature",
          },
        ],
        type: "FeatureCollection",
      },
      kind: "geojson",
    });
    const flowDatasetId = engine.addDataset({
      flows: [
        { from: [13, 52], id: "flow-a", metrics: { demand: 2 }, to: [14, 53] },
        { from: [13, 52], metrics: { demand: 0 }, to: [15, 54] },
        { from: [Number.NaN, 52], metrics: { demand: 3 }, to: [15, 54] },
      ],
      kind: "geo-flows",
    });

    engine.addLayer({ datasetId: geoDatasetId, kind: "geo-clusters", radius: 80 });
    engine.addLayer({ datasetId: geoDatasetId, kind: "geo-points" });
    engine.addLayer({ datasetId: geoDatasetId, kind: "geo-heat", weightMetric: "demand" });
    engine.addLayer({ datasetId: geoJsonDatasetId, kind: "geojson" });
    engine.addLayer({ datasetId: flowDatasetId, kind: "geo-flows", weightMetric: "demand" });

    const frame = engine.computeFrame({
      viewport: {
        bounds: [12.9, 51.9, 13.1, 52.1],
        center: [13, 52],
        display: "flat",
        height: 320,
        kind: "geo",
        width: 800,
        zoom: 1,
      },
    });

    expect(frame.layers.map((layer) => layer.kind)).toEqual([
      "geo-clusters",
      "geo-points",
      "geo-heat",
      "geojson",
      "geo-flows",
    ]);
    expect(
      frame.layers[0]?.kind === "geo-clusters" ? frame.layers[0].aggregation.summary : null,
    ).toMatchObject({ metrics: { demand: 5, weight: 5 }, visiblePointCount: 3 });
    expect(
      frame.layers[1]?.kind === "geo-points"
        ? frame.layers[1].features.map((point) => point.id)
        : [],
    ).toEqual(["a", "b", "c"]);
    expect(
      frame.layers[2]?.kind === "geo-heat"
        ? frame.layers[2].features.map((feature) => [feature.id, feature.rawWeight, feature.value])
        : [],
    ).toEqual([
      ["a", 2, 2 / 3],
      ["b", 3, 1],
    ]);
    expect(
      frame.layers[3]?.kind === "geojson" ? frame.layers[3].featureCollection.features : [],
    ).toHaveLength(1);
    expect(frame.layers[4]?.kind === "geo-flows" ? frame.layers[4].features : []).toMatchObject([
      { flow: { id: "flow-a" }, rawWeight: 2, value: 1 },
    ]);
    expect(frame.layers[4]?.bounds).toEqual([13, 52, 14, 53]);
  });

  test("reports mixed backend stats when a frame uses mixed indexes", () => {
    const backend = createVizEngineBackend("wasm");
    const datasets = new Map<string, VizEngineDatasetRecord>([
      [
        "xy",
        {
          dataset: { kind: "xy", points },
          index: { index: new RustWasmVizDensityIndex(points), kind: "xy" },
        },
      ],
      [
        "geo",
        {
          dataset: { kind: "geo-points", points: [{ latitude: 52, longitude: 13 }] },
          index: {
            index: new WasmVizGeoPointIndex([{ latitude: 52, longitude: 13 }]),
            kind: "geo-points",
          },
        },
      ],
    ]);
    const layers = new Map<string, VizLayer>([
      ["series", { datasetId: "xy", kind: "binned-series", targetBinCount: 2, xDomain: [0, 40] }],
      ["clusters", { datasetId: "geo", kind: "geo-clusters" }],
    ]);

    const frame = computeVizRenderFrame(datasets, layers, backend, {
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(frame.stats).toMatchObject({
      backend: "mixed",
      backendImplementation: "mixed",
      datasetCount: 2,
      layerCount: 2,
    });
    expect(frame.stats.diagnostics[0]).toMatchObject({ code: "incompatible-viewport" });
  });
});
