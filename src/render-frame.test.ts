import { afterEach, describe, expect, test } from "vitest";

import { JsVizGeoPointIndex } from "./backend/js-geo-index";
import { RustWasmVizDensityIndex } from "./backend/rust-wasm-density-index";
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
const originalPerformance = globalThis.performance;

afterEach(() => {
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: originalPerformance,
  });
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

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

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

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
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

  test("renders compact cartesian frame layers with typed-array payloads", () => {
    const engine = createVizEngine({ backend: "wasm" });
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
    engine.addLayer({
      datasetId,
      kind: "rolling-series",
      minPeriods: 2,
      statistic: "mean",
      windowSize: 3,
      xDomain: [0, 40],
    });

    const objectFrame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
    const compactFrame = engine.computeFrame({
      outputMode: "compact",
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(compactFrame.stats).toMatchObject({
      backend: "wasm",
      backendImplementation: "rust-viz-engine-wasm",
      diagnostics: [],
      layerCount: 4,
    });
    expect(compactFrame.layers.map((layer) => layer.bounds)).toEqual(
      objectFrame.layers.map((layer) => layer.bounds),
    );
    expect(compactFrame.layers[0]).toMatchObject({
      kind: "binned-series",
      outputMode: "compact",
    });
    expect(
      compactFrame.layers[0]?.kind === "binned-series" && "compactSeries" in compactFrame.layers[0]
        ? [...compactFrame.layers[0].compactSeries.pointCount]
        : [],
    ).toEqual([1, 1, 1, 2]);
    expect(
      compactFrame.layers[1]?.kind === "histogram" && "compactHistogram" in compactFrame.layers[1]
        ? [...compactFrame.layers[1].compactHistogram.pointCount]
        : [],
    ).toEqual([3, 1, 0, 1]);
    expect(
      compactFrame.layers[2]?.kind === "heatmap" && "compactHeatmap" in compactFrame.layers[2]
        ? compactFrame.layers[2].compactHeatmap.pointCount.length
        : 0,
    ).toBe(16);
    expect(
      compactFrame.layers[3]?.kind === "rolling-series" &&
        "compactRollingSeries" in compactFrame.layers[3]
        ? [...compactFrame.layers[3].compactRollingSeries.y]
        : [],
    ).toEqual([Number.NaN, 3, 14 / 3, 28 / 3, 56 / 3]);
  });

  test("auto backend promotes to wasm for compact cartesian frames", () => {
    const engine = createVizEngine({ backend: "auto" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 4,
      valueMode: "average",
      xDomain: [0, 40],
    });

    const objectFrame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
    const compactFrame = engine.computeFrame({
      outputMode: "compact",
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(["js", "wasm"]).toContain(objectFrame.stats.backend);
    expect(compactFrame.stats).toMatchObject({
      backend: "wasm",
      backendImplementation: "rust-viz-engine-wasm",
    });
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
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: undefined,
    });
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

  test("reuses unchanged render layers from a shared cache", () => {
    let calls = 0;
    const series = {
      bins: [],
      samples: [],
      summary: {
        binCount: 0,
        metrics: {},
        pointCount: 0,
        sampleCount: 0,
        valueMode: "average" as const,
        xDomain: [0, 40] as [number, number],
      },
    };
    const index = {
      getBackendCapabilities: () => ({
        backend: "js" as const,
        implementation: "js" as const,
        usesWasm: false,
      }),
      getChartSeries: () => {
        calls += 1;
        return series;
      },
    };
    const datasets = new Map<string, VizEngineDatasetRecord>([
      [
        "dataset",
        {
          dataset: { kind: "xy", points },
          index: { index, kind: "xy" } as never,
        },
      ],
    ]);
    const layers = new Map<string, VizLayer>([
      [
        "layer",
        {
          datasetId: "dataset",
          kind: "binned-series",
          targetBinCount: 5,
          xDomain: [0, 40],
        },
      ],
    ]);
    const backend = {
      createIndex: () => {
        throw new Error("not used");
      },
      option: { finance: "js", geo: "js", xy: "js" } as const,
      resolveBackend: () => "js" as const,
    };
    const cache = new Map();
    const options = {
      frameFormat: "objects" as const,
      viewport: { height: 320, width: 800, xDomain: [0, 40] as [number, number] },
    };
    const firstFrame = computeVizRenderFrame(datasets, layers, backend, options, cache);
    const secondFrame = computeVizRenderFrame(datasets, layers, backend, options, cache);

    expect(calls).toBe(1);
    expect(secondFrame.layers[0]).toBe(firstFrame.layers[0]);

    layers.set("layer", {
      datasetId: "dataset",
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [10, 40],
    });
    computeVizRenderFrame(datasets, layers, backend, options, cache);

    expect(calls).toBe(2);
  });

  test("filters computed layers and reports renderer stats", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    const firstLayerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 2,
      xDomain: [0, 40],
    });
    const secondLayerId = engine.addLayer({ bucketCount: 2, datasetId, kind: "histogram" });

    const frame = engine.computeFrame({
      layerIds: [secondLayerId, "missing-layer", firstLayerId],
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
    const cachedFrame = engine.computeFrame({
      layerIds: [secondLayerId],
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(frame.layers.map((layer) => layer.layerId)).toEqual([secondLayerId, firstLayerId]);
    expect(frame.stats).toMatchObject({
      cacheHitCount: 0,
      layerCount: 2,
      renderedLayerCount: 2,
      skippedLayerCount: 0,
    });
    expect(frame.stats.diagnostics[0]).toMatchObject({
      code: "missing-layer",
      layerId: "missing-layer",
    });
    expect(cachedFrame.stats.cacheHitCount).toBe(1);
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
    engine.addLayer({
      datasetId: geoDatasetId,
      fieldColumns: 2,
      fieldRows: 1,
      kind: "geo-scalar-field",
      valueMetric: "demand",
    });
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
      "geo-scalar-field",
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
      frame.layers[3]?.kind === "geo-scalar-field" ? frame.layers[3].grid : null,
    ).toMatchObject({
      bounds: [12.9, 51.9, 13.1, 52.1],
      columns: 2,
      rows: 1,
      valueDomain: [0, 3],
    });
    expect(
      frame.layers[4]?.kind === "geojson" ? frame.layers[4].featureCollection.features : [],
    ).toHaveLength(1);
    expect(frame.layers[5]?.kind === "geo-flows" ? frame.layers[5].features : []).toMatchObject([
      { flow: { id: "flow-a" }, rawWeight: 2, value: 1 },
    ]);
    expect(frame.layers[5]?.bounds).toEqual([13, 52, 14, 53]);
  });

  test("hydrates typed geo frame payloads back to object layers", () => {
    const engine = createVizEngine({ backend: "js" });
    const geoDatasetId = engine.addDataset({
      kind: "geo-points",
      points: [
        { id: "a", latitude: 52, longitude: 13, metrics: { demand: 2 } },
        { id: "b", latitude: 52.1, longitude: 13.1, metrics: { demand: 3 } },
      ],
    });
    const flowDatasetId = engine.addDataset({
      flows: [{ from: [13, 52], id: "flow-a", metrics: { demand: 2 }, to: [14, 53] }],
      kind: "geo-flows",
    });

    engine.addLayer({ datasetId: geoDatasetId, kind: "geo-points" });
    engine.addLayer({ datasetId: geoDatasetId, kind: "geo-heat", weightMetric: "demand" });
    engine.addLayer({
      datasetId: geoDatasetId,
      fieldColumns: 2,
      fieldRows: 1,
      kind: "geo-scalar-field",
      valueMetric: "demand",
    });
    engine.addLayer({ datasetId: flowDatasetId, kind: "geo-flows", weightMetric: "demand" });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: {
        bounds: [12.9, 51.9, 14.1, 53.1],
        center: [13.5, 52.5],
        display: "flat",
        height: 320,
        kind: "geo",
        width: 800,
        zoom: 7,
      },
    });
    const hydrated = engine.hydrateFrame(frame);

    expect(
      frame.layers[0]?.kind === "geo-points" ? "typedGeoPoints" in frame.layers[0] : false,
    ).toBe(true);
    expect(frame.layers[1]?.kind === "geo-heat" ? "typedGeoHeat" in frame.layers[1] : false).toBe(
      true,
    );
    expect(
      frame.layers[2]?.kind === "geo-scalar-field"
        ? "typedGeoScalarField" in frame.layers[2]
        : false,
    ).toBe(true);
    expect(frame.layers[3]?.kind === "geo-flows" ? "typedGeoFlows" in frame.layers[3] : false).toBe(
      true,
    );
    expect(hydrated.layers.map((layer) => layer.kind)).toEqual([
      "geo-points",
      "geo-heat",
      "geo-scalar-field",
      "geo-flows",
    ]);
    expect(
      hydrated.layers[0]?.kind === "geo-points" ? hydrated.layers[0].features : [],
    ).toHaveLength(2);
    expect(
      hydrated.layers[3]?.kind === "geo-flows" ? hydrated.layers[3].features : [],
    ).toHaveLength(1);
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
            index: new JsVizGeoPointIndex([{ latitude: 52, longitude: 13 }]),
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
