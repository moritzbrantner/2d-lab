import { describe, expect, test } from "vitest";

import { createVizEngine } from "./create-viz-engine";
import { hitTestVizFrame } from "./hit-test";

import type { VizRenderFrame } from "./types";

function frame(): VizRenderFrame {
  return {
    layers: [
      {
        bounds: null,
        buckets: [],
        datasetId: "dataset-histogram",
        kind: "histogram",
        layerId: "layer-histogram",
      },
      {
        bounds: [0, 1, 40, 8],
        datasetId: "dataset-series",
        kind: "binned-series",
        layerId: "layer-series",
        rows: [],
        series: {
          bins: [],
          samples: [
            {
              averageY: null,
              firstPoint: null,
              firstPointIndex: null,
              index: 0,
              lastPoint: null,
              lastPointIndex: null,
              maxY: null,
              metrics: {},
              minY: null,
              pointCount: 0,
              sumY: 0,
              x: 4,
              x0: 0,
              x1: 8,
              y: null,
            },
            {
              averageY: 4,
              firstPoint: { id: "b", sourceIndex: 1, x: 10, y: 4 },
              firstPointIndex: 1,
              index: 1,
              lastPoint: null,
              lastPointIndex: null,
              maxY: 4,
              metrics: {},
              minY: 4,
              pointCount: 1,
              sumY: 4,
              x: 12,
              x0: 8,
              x1: 16,
              y: 4,
            },
            {
              averageY: 8,
              firstPoint: null,
              firstPointIndex: null,
              index: 2,
              lastPoint: { id: "c", sourceIndex: 2, x: 20, y: 8 },
              lastPointIndex: 2,
              maxY: 8,
              metrics: {},
              minY: 8,
              pointCount: 1,
              sumY: 8,
              x: 20,
              x0: 16,
              x1: 24,
              y: 8,
            },
          ],
          summary: {
            binCount: 3,
            metrics: {},
            pointCount: 2,
            sampleCount: 3,
            valueMode: "average",
            xDomain: [0, 40],
          },
        },
      },
    ],
    stats: {
      backend: "js",
      backendImplementation: "js",
      computeMs: 0,
      datasetCount: 1,
      diagnostics: [],
      layerCount: 2,
    },
  };
}

describe("hitTestVizFrame", () => {
  test("returns null without a cartesian frame and viewport", () => {
    expect(hitTestVizFrame(null, { x: 0, y: 0 })).toBeNull();
    expect(hitTestVizFrame(frame(), { x: 0, y: 0 })).toBeNull();
    expect(
      hitTestVizFrame(frame(), {
        viewport: {
          bounds: [0, 0, 1, 1],
          center: [0, 0],
          display: "flat",
          height: 100,
          kind: "geo",
          width: 100,
          zoom: 1,
        },
        x: 0,
        y: 0,
      }),
    ).toBeNull();
  });

  test("returns the nearest populated binned-series sample", () => {
    expect(
      hitTestVizFrame(frame(), {
        viewport: { height: 100, width: 400, xDomain: [0, 40] },
        x: 196,
        y: 0,
      }),
    ).toMatchObject({
      datasetId: "dataset-series",
      kind: "cartesian",
      layerId: "layer-series",
      sampleIndex: 2,
      sourcePointId: "c",
      x: 20,
      y: 8,
    });
  });

  test("clamps pixel x values and handles non-positive width", () => {
    expect(
      cartesianHit(
        hitTestVizFrame(frame(), {
          viewport: { height: 100, width: 400, xDomain: [0, 40] },
          x: -20,
          y: 0,
        }),
      )?.sampleIndex,
    ).toBe(1);
    expect(
      cartesianHit(
        hitTestVizFrame(frame(), {
          viewport: { height: 100, width: 400, xDomain: [0, 40] },
          x: 900,
          y: 0,
        }),
      )?.sampleIndex,
    ).toBe(2);
    expect(
      cartesianHit(
        hitTestVizFrame(frame(), {
          viewport: { height: 100, width: 0, xDomain: [0, 40] },
          x: 900,
          y: 0,
        }),
      )?.sampleIndex,
    ).toBe(1);
  });

  test("falls back to null source point ids", () => {
    const noSourceFrame = frame();
    const layer = noSourceFrame.layers[1];

    if (layer?.kind !== "binned-series") {
      throw new Error("Expected a series layer");
    }

    layer.series.samples[1]!.firstPoint = null;
    layer.series.samples[1]!.lastPoint = null;

    expect(
      cartesianHit(
        hitTestVizFrame(noSourceFrame, {
          viewport: { height: 100, width: 400, xDomain: [0, 40] },
          x: 120,
          y: 0,
        }),
      )?.sourcePointId,
    ).toBeNull();
  });

  test("hit-tests histogram, heatmap, finance, geo flow, and geojson layers", () => {
    const engine = createVizEngine({ backend: "js" });
    const xyDatasetId = engine.addDataset({
      kind: "xy",
      points: [
        { id: "a", x: 0, y: 2 },
        { id: "b", x: 10, y: 4 },
        { id: "c", x: 20, y: 8 },
      ],
    });
    const financeDatasetId = engine.addDataset({
      bars: [
        { close: 10, high: 12, low: 8, open: 9, timestamp: 0 },
        { close: 12, high: 14, low: 9, open: 10, timestamp: 10 },
      ],
      instrument: { symbol: "AAPL" },
      kind: "finance-ohlcv",
    });
    const histogramLayerId = engine.addLayer({
      bucketCount: 2,
      datasetId: xyDatasetId,
      kind: "histogram",
      xDomain: [0, 20],
    });
    const heatmapLayerId = engine.addLayer({
      datasetId: xyDatasetId,
      kind: "heatmap",
      xBinCount: 2,
      xDomain: [0, 20],
      yBinCount: 2,
      yDomain: [0, 10],
    });
    const candleLayerId = engine.addLayer({
      datasetId: financeDatasetId,
      kind: "finance-candles",
      xDomain: [0, 10],
    });
    const viewport = { height: 100, width: 100, xDomain: [0, 20] as [number, number] };
    const frame = engine.computeFrame({ frameFormat: "objects", viewport });

    expect(
      engine.hitTest({
        frame,
        layerIds: [histogramLayerId],
        mode: "contains",
        viewport,
        x: 35,
        y: 35,
      }),
    ).toMatchObject({ kind: "cartesian", layerId: histogramLayerId, layerKind: "histogram" });
    expect(
      engine.hitTest({
        frame,
        layerIds: [heatmapLayerId],
        mode: "contains",
        viewport,
        x: 25,
        y: 50,
      }),
    ).toMatchObject({ kind: "cartesian", layerId: heatmapLayerId, layerKind: "heatmap" });
    expect(
      engine.hitTest({
        frame,
        layerIds: [candleLayerId],
        maxDistancePx: 1,
        mode: "contains",
        viewport,
        x: 0,
        y: 50,
      }),
    ).toMatchObject({ kind: "cartesian", layerId: candleLayerId, layerKind: "finance-candles" });

    const geoEngine = createVizEngine({ backend: "js" });
    const flowDatasetId = geoEngine.addDataset({
      flows: [{ from: [0, 0], id: "flow", to: [1, 1] }],
      kind: "geo-flows",
    });
    const geoJsonDatasetId = geoEngine.addDataset({
      featureCollection: {
        features: [
          {
            geometry: {
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
              type: "Polygon",
            },
            type: "Feature",
          },
        ],
        type: "FeatureCollection",
      },
      kind: "geojson",
    });
    const flowLayerId = geoEngine.addLayer({ datasetId: flowDatasetId, kind: "geo-flows" });
    const geoJsonLayerId = geoEngine.addLayer({ datasetId: geoJsonDatasetId, kind: "geojson" });
    const geoViewport = {
      bounds: [0, 0, 1, 1] as [number, number, number, number],
      center: [0.5, 0.5] as [number, number],
      display: "flat" as const,
      height: 100,
      kind: "geo" as const,
      width: 100,
      zoom: 1,
    };
    const geoFrame = geoEngine.computeFrame({ frameFormat: "objects", viewport: geoViewport });

    expect(
      geoEngine.hitTest({
        frame: geoFrame,
        layerIds: [flowLayerId],
        maxDistancePx: 2,
        viewport: geoViewport,
        x: 50,
        y: 50,
      }),
    ).toMatchObject({ kind: "geo-flow", layerId: flowLayerId, layerKind: "geo-flows" });
    expect(
      geoEngine.hitTest({
        frame: geoFrame,
        layerIds: [geoJsonLayerId],
        mode: "contains",
        viewport: geoViewport,
        x: 50,
        y: 50,
      }),
    ).toMatchObject({ kind: "geojson", layerId: geoJsonLayerId, layerKind: "geojson" });
  });
});

function cartesianHit(result: ReturnType<typeof hitTestVizFrame>) {
  return result?.kind === "cartesian" ? result : null;
}
