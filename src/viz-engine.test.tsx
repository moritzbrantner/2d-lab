import { renderHook, waitFor } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import {
  createChartDensityIndex,
  createChartRenderData,
  type ChartSeriesPoint,
} from "@moritzbrantner/charts";

import {
  VizEngineProvider,
  createVizEngine,
  useVizDataset,
  useVizFrame,
  useVizLayer,
  type VizRenderFrame,
} from "./index";

const points: ChartSeriesPoint[] = [
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
    expect(layer?.bounds).toEqual([0, 2, 40, 32]);
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

  test("keeps existing chart APIs working", () => {
    const index = createChartDensityIndex(points, { backend: "hybrid-js" });
    const series = index.getChartSeries({
      targetBinCount: 5,
      valueMode: "average",
      xDomain: [0, 40],
    });

    expect(createChartRenderData(series.samples).rows.map((row) => row.value)).toEqual([
      2, 4, 8, 16, 32,
    ]);
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
