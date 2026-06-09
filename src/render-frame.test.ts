import { afterEach, describe, expect, test } from "vitest";

import { JsVizGeoPointIndex } from "./backend/js-geo-index";
import { RustWasmVizDensityIndex } from "./backend/rust-wasm-density-index";
import { createVizEngine } from "./create-viz-engine";
import { createVizEngineBackend } from "./js-backend";
import { computeVizRenderFrame, createVizRenderRows } from "./render-frame";

import type {
  VizAnyRenderLayer,
  VizDensitySeries,
  VizEngineDatasetRecord,
  VizLayer,
  VizSeriesPoint,
} from "./types";
import type { VizRenderLayerCache, VizRenderLayerCacheQuery } from "./render-frame";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2, metrics: { count: 1 } },
  { id: "b", x: 10, y: 4, metrics: { count: 1 } },
  { id: "c", x: 20, y: 8, metrics: { count: 1 } },
  { id: "d", x: 30, y: 16, metrics: { count: 1 } },
  { id: "e", x: 40, y: 32, metrics: { count: 1 } },
];
const originalPerformance = globalThis.performance;

function createTestRenderLayerCache(): VizRenderLayerCache {
  const cache = new Map<string, VizAnyRenderLayer>();

  return {
    clear() {
      cache.clear();
    },
    deleteLayer(layerId) {
      for (const key of cache.keys()) {
        if (key.startsWith(`${layerId}\0`)) {
          cache.delete(key);
        }
      }
    },
    get(query) {
      return cache.get(testCacheKey(query));
    },
    set(query, layer) {
      cache.set(testCacheKey(query), layer);
      return 0;
    },
  };
}

function testCacheKey(query: VizRenderLayerCacheQuery) {
  return [
    query.layerId,
    query.datasetVersion,
    query.layerVersion,
    query.frameFormat,
    query.viewportSignature,
    query.querySignature,
  ].join("\0");
}

function createNumericTableDataset(rowCount: number) {
  return {
    columns: [
      {
        id: "score",
        type: "number" as const,
        values: Float64Array.from({ length: rowCount }, (_, index) => index),
      },
      {
        id: "active",
        type: "boolean" as const,
        values: Uint8Array.from({ length: rowCount }, (_, index) => (index % 2 === 0 ? 1 : 0)),
      },
      {
        id: "name",
        type: "string" as const,
        values: Array.from({ length: rowCount }, (_, index) => `core-${index}`),
      },
    ],
    kind: "table" as const,
    rowIds: Array.from({ length: rowCount }, (_, index) => `row-${index}`),
  };
}

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
    expect(compactFrame.layers.map((layer) => ("bounds" in layer ? layer.bounds : null))).toEqual(
      objectFrame.layers.map((layer) => ("bounds" in layer ? layer.bounds : null)),
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

  test("auto backend defers wasm promotion for compact cartesian frames until warmup", async () => {
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
      backend: "js",
      backendImplementation: "js",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const smallWarmedCompactFrame = engine.computeFrame({
      outputMode: "compact",
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(smallWarmedCompactFrame.stats).toMatchObject({
      backend: "js",
      backendImplementation: "js",
    });

    const largePoints = Array.from({ length: 5_000 }, (_, index) => ({
      id: `point-${index}`,
      x: index,
      y: index % 97,
    }));
    const largeEngine = createVizEngine({ backend: "auto" });
    const largeDatasetId = largeEngine.addDataset({ kind: "xy", points: largePoints });
    largeEngine.addLayer({
      datasetId: largeDatasetId,
      kind: "binned-series",
      targetBinCount: 64,
      valueMode: "average",
      xDomain: [0, 4_999],
    });
    const largeFirstCompactFrame = largeEngine.computeFrame({
      outputMode: "compact",
      viewport: { height: 320, width: 800, xDomain: [0, 4_999] },
    });

    expect(largeFirstCompactFrame.stats).toMatchObject({
      backend: "js",
      backendImplementation: "js",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    const largeWarmedCompactFrame = largeEngine.computeFrame({
      outputMode: "compact",
      viewport: { height: 320, width: 800, xDomain: [0, 4_999] },
    });

    expect(largeWarmedCompactFrame.stats).toMatchObject({
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
      option: { finance: "js", geo: "js", table: "js", xy: "js" } as const,
      resolveBackend: () => "js" as const,
    };
    const cache = createTestRenderLayerCache();
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
    ).toMatchObject({ metrics: {}, visiblePointCount: 3 });
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
    expect(frame.layers[5] && "bounds" in frame.layers[5] ? frame.layers[5].bounds : null).toEqual([
      13, 52, 14, 53,
    ]);
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

  test("computes typed table frames by default", () => {
    const engine = createVizEngine({ backend: "wasm" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [
        { id: "a", name: "Ada", score: 10 },
        { id: "b", name: "Ben", score: 5 },
      ],
      rowIdKey: "id",
    });

    engine.addLayer({
      datasetId,
      kind: "table",
      query: { sort: [{ columnId: "score", direction: "desc" }] },
    });

    const frame = engine.computeFrame({
      viewport: { kind: "table", rowLimit: 1, rowOffset: 0 },
    });
    const layer = frame.layers[0];

    expect(frame.stats).toMatchObject({
      backend: "js",
      backendImplementation: "js",
      diagnostics: [],
    });
    expect(layer?.kind).toBe("table");
    expect(layer?.kind === "table" && "typedTable" in layer ? layer.typedTable.rowIds : []).toEqual(
      ["a"],
    );
    expect(
      layer?.kind === "table" && "typedTable" in layer
        ? layer.typedTable.summary.visibleRowCount
        : 0,
    ).toBe(1);
  });

  test("reports WASM stats for explicit WASM columnar numeric table frames", () => {
    const engine = createVizEngine({ backend: "wasm" });
    const datasetId = engine.addDataset(createNumericTableDataset(4));
    engine.addLayer({
      datasetId,
      kind: "table",
      query: { sort: [{ columnId: "score", direction: "desc" }] },
    });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table", rowLimit: 2 },
    });

    expect(frame.stats).toMatchObject({
      backend: "wasm",
      backendImplementation: "rust-viz-engine-wasm",
    });
  });

  test("reports JS stats for explicit WASM object table frames", () => {
    const engine = createVizEngine({ backend: "wasm" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [
        { id: "a", score: 1 },
        { id: "b", score: 2 },
      ],
      rowIdKey: "id",
    });
    engine.addLayer({ datasetId, kind: "table" });

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { kind: "table" },
    });

    expect(frame.stats).toMatchObject({
      backend: "js",
      backendImplementation: "js",
    });
  });

  test("reports JS stats for auto table backend below threshold", () => {
    const engine = createVizEngine({ backend: "auto" });
    const datasetId = engine.addDataset(createNumericTableDataset(99_999));
    engine.addLayer({ datasetId, kind: "table" });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table", rowLimit: 1 },
    });

    expect(frame.stats).toMatchObject({
      backend: "js",
      backendImplementation: "js",
    });
  });

  test("reports WASM stats for auto table backend at threshold", () => {
    const engine = createVizEngine({ backend: "auto" });
    const datasetId = engine.addDataset(createNumericTableDataset(100_000));
    engine.addLayer({ datasetId, kind: "table" });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table", rowLimit: 1 },
    });

    expect(frame.stats).toMatchObject({
      backend: "wasm",
      backendImplementation: "rust-viz-engine-wasm",
    });
  });

  test("falls back for string sort on WASM-backed table without changing stats", () => {
    const engine = createVizEngine({ backend: "wasm" });
    const datasetId = engine.addDataset(createNumericTableDataset(3));
    engine.addLayer({
      datasetId,
      kind: "table",
      query: { sort: [{ columnId: "name", direction: "desc" }] },
    });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table" },
    });

    expect(frame.stats).toMatchObject({
      backend: "wasm",
      backendImplementation: "rust-viz-engine-wasm",
    });
    expect(
      frame.layers[0]?.kind === "table" && "typedTable" in frame.layers[0]
        ? frame.layers[0].typedTable.rowIds
        : [],
    ).toEqual(["row-2", "row-1", "row-0"]);
  });

  test("matches JS row IDs for numeric filter and sort on WASM-backed table", () => {
    const dataset = createNumericTableDataset(256);
    const layer = {
      datasetId: "dataset",
      kind: "table" as const,
      query: {
        filters: [{ columnId: "score", operator: "gte" as const, value: 128 }],
        sort: [{ columnId: "score", direction: "desc" as const }],
      },
    };
    const jsEngine = createVizEngine({ backend: "js" });
    const wasmEngine = createVizEngine({ backend: "wasm" });
    const jsDatasetId = jsEngine.addDataset(dataset);
    const wasmDatasetId = wasmEngine.addDataset(dataset);
    jsEngine.addLayer({ ...layer, datasetId: jsDatasetId });
    wasmEngine.addLayer({ ...layer, datasetId: wasmDatasetId });

    const options = {
      frameFormat: "typed" as const,
      viewport: { kind: "table" as const, rowLimit: 16 },
    };
    const jsFrame = jsEngine.computeFrame(options);
    const wasmFrame = wasmEngine.computeFrame(options);

    expect(
      wasmFrame.layers[0]?.kind === "table" && "typedTable" in wasmFrame.layers[0]
        ? Array.from(wasmFrame.layers[0].typedTable.sourceIndex)
        : [],
    ).toEqual(
      jsFrame.layers[0]?.kind === "table" && "typedTable" in jsFrame.layers[0]
        ? Array.from(jsFrame.layers[0].typedTable.sourceIndex)
        : [],
    );
  });

  test("matches JS row IDs for ASCII string search on WASM-backed table", () => {
    const dataset = createNumericTableDataset(64);
    const jsEngine = createVizEngine({ backend: "js" });
    const wasmEngine = createVizEngine({ backend: "wasm" });
    const jsDatasetId = jsEngine.addDataset(dataset);
    const wasmDatasetId = wasmEngine.addDataset(dataset);
    const query = { search: { columnIds: ["name"], query: "core-1" } };
    jsEngine.addLayer({ datasetId: jsDatasetId, kind: "table", query });
    wasmEngine.addLayer({ datasetId: wasmDatasetId, kind: "table", query });

    const options = {
      frameFormat: "typed" as const,
      viewport: { kind: "table" as const, rowLimit: 16 },
    };
    const jsFrame = jsEngine.computeFrame(options);
    const wasmFrame = wasmEngine.computeFrame(options);

    expect(
      wasmFrame.layers[0]?.kind === "table" && "typedTable" in wasmFrame.layers[0]
        ? wasmFrame.layers[0].typedTable.rowIds
        : [],
    ).toEqual(
      jsFrame.layers[0]?.kind === "table" && "typedTable" in jsFrame.layers[0]
        ? jsFrame.layers[0].typedTable.rowIds
        : [],
    );
  });

  test("falls back internally for non-ASCII string search on WASM-backed table", () => {
    const dataset = {
      columns: [
        { id: "score", type: "number" as const, values: new Float64Array([1, 2, 3]) },
        { id: "name", type: "string" as const, values: ["café", "core", "caff"] },
      ],
      kind: "table" as const,
      rowIds: ["accent", "plain", "ascii"],
    };
    const jsEngine = createVizEngine({ backend: "js" });
    const wasmEngine = createVizEngine({ backend: "wasm" });
    const jsDatasetId = jsEngine.addDataset(dataset);
    const wasmDatasetId = wasmEngine.addDataset(dataset);
    const query = { search: { columnIds: ["name"], query: "é" } };
    jsEngine.addLayer({ datasetId: jsDatasetId, kind: "table", query });
    wasmEngine.addLayer({ datasetId: wasmDatasetId, kind: "table", query });

    const options = {
      frameFormat: "typed" as const,
      viewport: { kind: "table" as const },
    };
    const jsFrame = jsEngine.computeFrame(options);
    const wasmFrame = wasmEngine.computeFrame(options);

    expect(wasmFrame.stats).toMatchObject({
      backend: "wasm",
      backendImplementation: "rust-viz-engine-wasm",
    });
    expect(
      wasmFrame.layers[0]?.kind === "table" && "typedTable" in wasmFrame.layers[0]
        ? wasmFrame.layers[0].typedTable.rowIds
        : [],
    ).toEqual(
      jsFrame.layers[0]?.kind === "table" && "typedTable" in jsFrame.layers[0]
        ? jsFrame.layers[0].typedTable.rowIds
        : [],
    );
  });

  test("computes typed table frames with combined query filters, search, sort, and window", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [
        { id: "a", name: "Ada", role: "analyst", score: 10 },
        { id: "b", name: "Ben", role: "analyst", score: 5 },
        { id: "c", name: "Cam", role: "engineer", score: 8 },
        { id: "d", name: "Dee", role: "analyst", score: 7 },
      ],
      rowIdKey: "id",
    });

    engine.addLayer({
      datasetId,
      kind: "table",
      query: {
        filters: [{ columnId: "score", operator: "gte", value: 6 }],
        search: { columnIds: ["role"], query: "analyst" },
        sort: [{ columnId: "score", direction: "desc" }],
      },
    });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table", rowLimit: 2, rowOffset: 0 },
    });
    const layer = frame.layers[0];

    expect(frame.stats.diagnostics).toEqual([]);
    expect(layer?.kind === "table" && "typedTable" in layer ? layer.typedTable.rowIds : []).toEqual(
      ["a", "d"],
    );
    expect(
      layer?.kind === "table" && "typedTable" in layer
        ? layer.typedTable.typedColumns.find((column) => column.id === "score")?.type
        : null,
    ).toBe("number");
  });

  test("computes object table frames", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [
        { id: "a", name: "Ada", score: 10 },
        { id: "b", name: "Ben", score: 5 },
      ],
      rowIdKey: "id",
    });
    engine.addLayer({
      datasetId,
      kind: "table",
      query: {
        filters: [{ columnId: "score", operator: "gte", value: 6 }],
        rowLimit: 10,
      },
    });

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { kind: "table", rowLimit: 1, rowOffset: 0 },
    });
    const layer = frame.layers[0];

    expect(layer?.kind === "table" ? layer.table.rows.map((row) => row.rowId) : []).toEqual(["a"]);
    expect(layer?.kind === "table" ? layer.table.summary.filteredRowCount : 0).toBe(1);
    expect(
      layer?.kind === "table" ? layer.table.rows[0]?.cells.map((cell) => cell.value) : [],
    ).toEqual(["a", "Ada", 10]);
  });

  test("reuses same-window table frames and misses cache for shifting windows", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [
        { id: "a", score: 30 },
        { id: "b", score: 20 },
        { id: "c", score: 10 },
      ],
      rowIdKey: "id",
    });
    engine.addLayer({
      datasetId,
      kind: "table",
      query: { sort: [{ columnId: "score", direction: "desc" }] },
    });

    const first = engine.computeFrame({ viewport: { kind: "table", rowLimit: 1, rowOffset: 0 } });
    const sameWindow = engine.computeFrame({
      viewport: { kind: "table", rowLimit: 1, rowOffset: 0 },
    });
    const shiftingWindow = engine.computeFrame({
      viewport: { kind: "table", rowLimit: 1, rowOffset: 1 },
    });

    expect(sameWindow.stats.cacheHitCount).toBe(1);
    expect(sameWindow.layers[0]).toBe(first.layers[0]);
    expect(shiftingWindow.stats.cacheHitCount).toBe(0);
    expect(
      shiftingWindow.layers[0]?.kind === "table" && "typedTable" in shiftingWindow.layers[0]
        ? shiftingWindow.layers[0].typedTable.rowIds
        : [],
    ).toEqual(["b"]);
  });

  test("reports table layer diagnostics for incompatible datasets, viewports, and filters", () => {
    const engine = createVizEngine({ backend: "js" });
    const xyDatasetId = engine.addDataset({ kind: "xy", points });
    const tableDatasetId = engine.addDataset({
      kind: "table",
      rows: [{ name: "Ada", score: 10 }],
    });

    engine.addLayer({ datasetId: xyDatasetId, kind: "table" });
    engine.addLayer({ datasetId: tableDatasetId, kind: "table" });
    engine.addLayer({
      datasetId: tableDatasetId,
      kind: "table",
      query: { filters: [{ columnId: "name", operator: "gt", value: 1 }] },
    });

    const cartesianFrame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
    expect(cartesianFrame.stats.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "incompatible-viewport",
    );

    const tableFrame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { kind: "table" },
    });
    expect(tableFrame.stats.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "incompatible-layer-dataset",
      "incompatible-table-filter",
    ]);
    expect(tableFrame.layers[1]?.kind === "table" ? tableFrame.layers[1].table.rows : []).toEqual(
      [],
    );
  });

  test("keeps invalid table filter diagnostics stable", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [{ name: "Ada", score: 10 }],
    });
    engine.addLayer({
      datasetId,
      kind: "table",
      query: {
        filters: [
          { columnId: "missing", operator: "equals", value: 1 },
          { columnId: "score", operator: "between", value: [1] },
          { columnId: "score", operator: "in", value: 1 },
        ],
      },
    });

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { kind: "table" },
    });

    expect(frame.stats.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknown-table-column",
      "invalid-table-filter",
      "invalid-table-filter",
    ]);
    expect(frame.layers[0]?.kind === "table" ? frame.layers[0].table.rows : []).toEqual([]);
  });

  test("caches table layers and invalidates on dataset and layer updates", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "table",
      rows: [
        { id: "a", score: 10 },
        { id: "b", score: 5 },
      ],
      rowIdKey: "id",
    });
    const layerId = engine.addLayer({
      datasetId,
      kind: "table",
      query: { rowLimit: 1, sort: [{ columnId: "score", direction: "desc" }] },
    });
    const options = { viewport: { kind: "table" as const, rowLimit: 1 } };

    engine.computeFrame(options);
    const cachedFrame = engine.computeFrame(options);
    expect(cachedFrame.stats.cacheHitCount).toBe(1);

    engine.updateDataset(datasetId, {
      kind: "table",
      rows: [
        { id: "a", score: 10 },
        { id: "b", score: 50 },
      ],
      rowIdKey: "id",
    });
    const updatedDatasetFrame = engine.computeFrame(options);
    expect(updatedDatasetFrame.stats.cacheHitCount).toBe(0);
    expect(
      updatedDatasetFrame.layers[0]?.kind === "table" &&
        "typedTable" in updatedDatasetFrame.layers[0]
        ? updatedDatasetFrame.layers[0].typedTable.rowIds
        : [],
    ).toEqual(["b"]);

    engine.updateLayer(layerId, {
      datasetId,
      kind: "table",
      query: { rowLimit: 1, sort: [{ columnId: "score", direction: "asc" }] },
    });
    const updatedLayerFrame = engine.computeFrame(options);
    expect(updatedLayerFrame.stats.cacheHitCount).toBe(0);
    expect(
      updatedLayerFrame.layers[0]?.kind === "table" && "typedTable" in updatedLayerFrame.layers[0]
        ? updatedLayerFrame.layers[0].typedTable.rowIds
        : [],
    ).toEqual(["a"]);
  });

  test("hydrates typed table frames into object table rows", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      columns: [
        { id: "name", values: ["Ada", "Ben"] },
        { id: "score", type: "number", values: [10, null] },
        { id: "active", type: "boolean", values: [true, false] },
      ],
      kind: "table",
      rowIds: ["row-a", "row-b"],
    });
    engine.addLayer({
      datasetId,
      kind: "table",
      query: { columnIds: ["score", "name", "active"], rowOffset: 1, rowLimit: 1 },
    });

    const typedFrame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table" },
    });
    const hydrated = engine.hydrateFrame(typedFrame);
    const layer = hydrated.layers[0];

    expect(layer?.kind).toBe("table");
    expect(layer?.kind === "table" ? layer.table.columns.map((column) => column.id) : []).toEqual([
      "score",
      "name",
      "active",
    ]);
    expect(layer?.kind === "table" ? layer.table.rows[0] : null).toMatchObject({
      rowId: "row-b",
      sourceIndex: 1,
    });
    expect(
      layer?.kind === "table" ? layer.table.rows[0]?.cells.map((cell) => cell.value) : [],
    ).toEqual([null, "Ben", false]);
  });
});
