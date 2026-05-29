import { renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useMemo, type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import {
  VizEngineProvider,
  createVizEngine,
  useVizDataset,
  useVizFrame,
  useVizLayer,
  type VizRenderFrame,
  type VizSeriesPoint,
} from "./index";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2 },
  { id: "b", x: 10, y: 4 },
  { id: "c", x: 20, y: 8 },
  { id: "d", x: 30, y: 16 },
  { id: "e", x: 40, y: 32 },
];

describe("viz engine", () => {
  test("creates an engine and registers datasets and layers", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    const layerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });

    expect(engine.getDatasetCount()).toBe(1);
    expect(engine.getLayerCount()).toBe(1);

    engine.removeLayer(layerId);
    expect(engine.getLayerCount()).toBe(0);

    engine.removeDataset(datasetId);
    expect(engine.getDatasetCount()).toBe(0);
  });

  test("computes a binned-series frame", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 4,
      valueMode: "average",
      xDomain: [0, 40],
    });

    const frame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });
    const [layer] = frame.layers;

    expect(frame.stats).toMatchObject({
      backend: "js",
      datasetCount: 1,
      layerCount: 1,
    });
    expect(layer?.kind).toBe("binned-series");
    expect(layer?.datasetId).toBe(datasetId);
    expect(layer?.bounds).toEqual([0, 2, 40, 24]);
    expect(layer?.kind === "binned-series" ? layer.rows.length : 0).toBe(4);
  });

  test("computes histogram and heatmap layers from one registered dataset", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      bucketCount: 4,
      datasetId,
      kind: "histogram",
      xDomain: [0, 40],
    });
    engine.addLayer({
      datasetId,
      kind: "heatmap",
      xBinCount: 4,
      xDomain: [0, 40],
      yBinCount: 4,
      yDomain: [0, 40],
    });

    const frame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(frame.stats.datasetCount).toBe(1);
    expect(frame.stats.layerCount).toBe(2);
    expect(frame.layers.map((layer) => layer.kind)).toEqual(["histogram", "heatmap"]);
    expect(frame.layers[0]?.datasetId).toBe(datasetId);
    expect(frame.layers[1]?.datasetId).toBe(datasetId);
    expect(frame.layers[0]?.bounds).toEqual([2, 0, 32, 3]);
    expect(frame.layers[1]?.bounds).toEqual([0, 0, 40, 40]);
  });

  test("lets multiple layers share one dataset", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 4,
      xDomain: [0, 40],
    });
    engine.addLayer({
      bucketCount: 4,
      datasetId,
      kind: "histogram",
    });
    engine.addLayer({
      datasetId,
      kind: "heatmap",
      xBinCount: 4,
      xDomain: [0, 40],
      yBinCount: 4,
    });

    const frame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(engine.getDatasetCount()).toBe(1);
    expect(frame.layers).toHaveLength(3);
    expect(new Set(frame.layers.map((layer) => layer.datasetId))).toEqual(new Set([datasetId]));
  });

  test("reports the selected backend in frame stats", () => {
    const jsEngine = createVizEngine({ backend: "js" });
    const wasmEngine = createVizEngine({ backend: "wasm" });

    for (const engine of [jsEngine, wasmEngine]) {
      const datasetId = engine.addDataset({ kind: "xy", points });

      engine.addLayer({
        datasetId,
        kind: "binned-series",
        targetBinCount: 2,
        xDomain: [0, 40],
      });
    }

    expect(
      jsEngine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).stats
        .backend,
    ).toBe("js");
    expect(
      wasmEngine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).stats
        .backend,
    ).toBe("wasm");
    expect(
      wasmEngine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } }).stats
        .backendImplementation,
    ).toBe("rust-viz-engine-wasm");
  });

  test("hit tests a visible binned-series layer", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });
    const layerId = engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      xDomain: [0, 40],
    });

    engine.computeFrame({ viewport: { height: 320, width: 800, xDomain: [0, 40] } });

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

  test("creates render rows without chart package helpers", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 5,
      valueMode: "average",
      xDomain: [0, 40],
    });

    const frame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(
      frame.layers[0]?.kind === "binned-series" ? frame.layers[0].rows.map((row) => row.value) : [],
    ).toEqual([2, 4, 8, 16, 32]);
  });

  test("uses rendered binned-series values for layer bounds", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "binned-series",
      targetBinCount: 2,
      valueMode: "count",
      xDomain: [0, 40],
    });

    const frame = engine.computeFrame({
      viewport: { height: 320, width: 800, xDomain: [0, 40] },
    });

    expect(frame.layers[0]?.bounds).toEqual([0, 2, 40, 3]);
  });

  test("keeps js and wasm density results equivalent", () => {
    const frames = ["js", "wasm"].map((backend) => {
      const engine = createVizEngine({ backend: backend as "js" | "wasm" });
      const datasetId = engine.addDataset({
        kind: "xy",
        points: points.map((point) => ({
          ...point,
          metrics: { count: 1 },
        })),
      });

      engine.addLayer({
        datasetId,
        kind: "binned-series",
        targetBinCount: 4,
        valueMode: "sum",
        xDomain: [0, 40],
      });
      engine.addLayer({
        bucketCount: 4,
        datasetId,
        kind: "histogram",
        xDomain: [0, 40],
      });
      engine.addLayer({
        datasetId,
        kind: "heatmap",
        xBinCount: 4,
        xDomain: [0, 40],
        yBinCount: 4,
        yDomain: [0, 40],
      });

      return engine.computeFrame({
        viewport: { height: 320, width: 800, xDomain: [0, 40] },
      });
    });

    expect(publicFrame(frames[1])).toEqual(publicFrame(frames[0]));
  });

  test("computes geo point and cluster layers", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "geo-points",
      points: [
        { id: "a", latitude: 52, longitude: 13, metrics: { demand: 2 } },
        { id: "b", latitude: 52.0001, longitude: 13.0001, metrics: { demand: 3 } },
      ],
    });

    engine.addLayer({
      datasetId,
      kind: "geo-clusters",
      radius: 80,
    });
    engine.addLayer({
      datasetId,
      kind: "geo-heat",
      weightMetric: "demand",
    });

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

    expect(frame.stats.diagnostics).toEqual([]);
    expect(frame.layers.map((layer) => layer.kind)).toEqual(["geo-clusters", "geo-heat"]);
    expect(
      frame.layers[0]?.kind === "geo-clusters"
        ? frame.layers[0].aggregation.summary.visiblePointCount
        : 0,
    ).toBe(2);
    expect(
      frame.layers[1]?.kind === "geo-heat"
        ? frame.layers[1].features.map((feature) => feature.rawWeight)
        : [],
    ).toEqual([2, 3]);
  });

  test("computes geo clusters with wasm backend", () => {
    const engine = createVizEngine({ backend: "wasm" });
    const datasetId = engine.addDataset({
      kind: "geo-points",
      points: [
        { id: "a", latitude: 52, longitude: 13, metrics: { demand: 2 } },
        { id: "b", latitude: 52.0001, longitude: 13.0001, metrics: { demand: 3 } },
      ],
    });

    engine.addLayer({
      datasetId,
      kind: "geo-clusters",
      radius: 80,
    });

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

    expect(frame.stats.backend).toBe("wasm");
    expect(frame.stats.backendImplementation).toBe("legacy-wasm");
    expect(
      frame.layers[0]?.kind === "geo-clusters"
        ? frame.layers[0].aggregation.summary.metrics.demand
        : 0,
    ).toBe(5);
  });

  test("skips incompatible geo layers with diagnostics", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({ kind: "xy", points });

    engine.addLayer({
      datasetId,
      kind: "geo-clusters",
    });

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

    expect(frame.layers).toEqual([]);
    expect(frame.stats.diagnostics[0]).toMatchObject({
      code: "incompatible-layer-dataset",
      severity: "warning",
    });
    expect(frame.stats.backendImplementation).toBe("js");
  });

  test("does not import the charts package", () => {
    for (const path of [
      "src/types.ts",
      "src/js-backend.ts",
      "src/render-frame.ts",
      "src/react.tsx",
      "package.json",
    ]) {
      expect(readFileSync(path, "utf8")).not.toContain("@moritzbrantner/charts");
    }
  });

  test("provides thin React lifecycle hooks", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider backend="js">{children}</VizEngineProvider>
    );

    const { result } = renderHook(
      () => {
        const datasetId = useVizDataset(points);
        const layer = useMemo(
          () =>
            datasetId
              ? {
                  datasetId,
                  kind: "binned-series" as const,
                  targetBinCount: 5,
                  xDomain: [0, 40] as [number, number],
                }
              : null,
          [datasetId],
        );
        const layerId = useVizLayer(layer);
        const frame = useVizFrame({ height: 320, width: 800, xDomain: [0, 40] }, [
          datasetId,
          layerId,
        ]);

        return { datasetId, frame, layerId };
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.datasetId).toBeTruthy();
      expect(result.current.layerId).toBeTruthy();
    });

    expect((result.current.frame as VizRenderFrame).stats.datasetCount).toBe(1);
  });
});

function publicFrame(frame: VizRenderFrame) {
  return frame.layers.map((layer) => {
    if (layer.kind === "binned-series") {
      return {
        kind: layer.kind,
        rows: layer.rows.map((row) => ({
          count: row.count,
          max: row.max,
          min: row.min,
          sum: row.sum,
          value: row.value,
          x0: row.x0,
          x1: row.x1,
        })),
      };
    }

    if (layer.kind === "histogram") {
      return {
        buckets: layer.buckets.map((bucket) => ({
          averageValue: bucket.averageValue,
          maxValue: bucket.maxValue,
          minValue: bucket.minValue,
          pointCount: bucket.pointCount,
          value0: bucket.value0,
          value1: bucket.value1,
        })),
        kind: layer.kind,
      };
    }

    if (layer.kind === "heatmap") {
      return {
        cells: layer.cells.map((cell) => ({
          averageValue: cell.averageValue,
          pointCount: cell.pointCount,
          value: cell.value,
          x0: cell.x0,
          x1: cell.x1,
          y0: cell.y0,
          y1: cell.y1,
        })),
        kind: layer.kind,
      };
    }

    return { kind: layer.kind };
  });
}
