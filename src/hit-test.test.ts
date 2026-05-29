import { describe, expect, test } from "vitest";

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
});

function cartesianHit(result: ReturnType<typeof hitTestVizFrame>) {
  return result?.kind === "cartesian" ? result : null;
}
