import { renderHook, waitFor } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  VizEngineProvider,
  useVizDataset,
  useVizEngine,
  useVizFrame,
  useVizLayer,
  useVizTypedFrame,
} from "./react";

import type { VizEngine, VizRenderFrame, VizSeriesPoint } from "./types";

const points: VizSeriesPoint[] = [
  { id: "a", x: 0, y: 2 },
  { id: "b", x: 10, y: 4 },
];

function createFrame(): VizRenderFrame {
  return {
    layers: [],
    stats: {
      backend: "js",
      backendImplementation: "js",
      computeMs: 0,
      datasetCount: 0,
      diagnostics: [],
      layerCount: 0,
    },
  };
}

function createFakeEngine(): VizEngine {
  return {
    addDataset: vi.fn(() => "dataset-1"),
    addLayer: vi.fn(() => "layer-1"),
    clear: vi.fn(),
    computeFrame: vi.fn(() => createFrame()),
    getDatasetCount: vi.fn(() => 0),
    getLayerCount: vi.fn(() => 0),
    hydrateFrame: vi.fn((frame) => frame),
    hydrateLayer: vi.fn(() => null),
    hitTest: vi.fn(() => null),
    removeDataset: vi.fn(),
    removeLayer: vi.fn(),
    updateDataset: vi.fn(() => true),
    updateLayer: vi.fn(() => true),
  };
}

describe("React viz engine bindings", () => {
  test("throws when useVizEngine is called outside the provider", () => {
    expect(() => renderHook(() => useVizEngine())).toThrow(
      "useVizEngine must be used within a VizEngineProvider.",
    );
  });

  test("provides an explicit engine", () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );

    expect(renderHook(() => useVizEngine(), { wrapper }).result.current).toBe(engine);
  });

  test("registers and removes datasets across lifecycle changes", async () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const { result, rerender, unmount } = renderHook(({ value }) => useVizDataset(value), {
      initialProps: { value: points },
      wrapper,
    });

    await waitFor(() => expect(result.current).toBe("dataset-1"));
    expect(engine.addDataset).toHaveBeenCalledWith({ kind: "xy", points });

    const nextPoints = [{ id: "c", x: 20, y: 8 }];
    rerender({ value: nextPoints });

    await waitFor(() => expect(engine.addDataset).toHaveBeenCalledTimes(2));
    expect(engine.removeDataset).toHaveBeenCalledWith("dataset-1");

    unmount();
    expect(engine.removeDataset).toHaveBeenCalledTimes(2);
  });

  test("keeps dataset and layer registrations stable for memoized inputs", async () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const layer = { datasetId: "dataset-1", kind: "histogram" as const, bucketCount: 2 };
    const { rerender } = renderHook(
      () => ({
        datasetId: useVizDataset(points),
        layerId: useVizLayer(layer),
      }),
      { wrapper },
    );

    await waitFor(() => expect(engine.addDataset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(engine.addLayer).toHaveBeenCalledTimes(1));

    rerender();

    expect(engine.addDataset).toHaveBeenCalledTimes(1);
    expect(engine.addLayer).toHaveBeenCalledTimes(1);
  });

  test("re-registers when callers pass new object identities", async () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const { rerender } = renderHook(
      ({ dataset, layer }) => ({
        datasetId: useVizDataset(dataset),
        layerId: useVizLayer(layer),
      }),
      {
        initialProps: {
          dataset: [{ id: "p-1", x: 1, y: 1 }],
          layer: { datasetId: "dataset-1", kind: "histogram" as const, bucketCount: 2 },
        },
        wrapper,
      },
    );

    await waitFor(() => expect(engine.addDataset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(engine.addLayer).toHaveBeenCalledTimes(1));

    rerender({
      dataset: [{ id: "p-2", x: 2, y: 2 }],
      layer: { datasetId: "dataset-1", kind: "histogram" as const, bucketCount: 2 },
    });

    await waitFor(() => expect(engine.addDataset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(engine.addLayer).toHaveBeenCalledTimes(2));
    expect(engine.removeDataset).toHaveBeenCalledWith("dataset-1");
    expect(engine.removeLayer).toHaveBeenCalledWith("layer-1");
  });

  test("updates dataset and layer registrations when update lifecycle is requested", async () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const { rerender, unmount } = renderHook(
      ({ dataset, layer }) => ({
        datasetId: useVizDataset(dataset, { lifecycle: "update" }),
        layerId: useVizLayer(layer, { lifecycle: "update" }),
      }),
      {
        initialProps: {
          dataset: [{ id: "p-1", x: 1, y: 1 }],
          layer: { datasetId: "dataset-1", kind: "histogram" as const, bucketCount: 2 },
        },
        wrapper,
      },
    );

    await waitFor(() => expect(engine.addDataset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(engine.addLayer).toHaveBeenCalledTimes(1));

    rerender({
      dataset: [{ id: "p-2", x: 2, y: 2 }],
      layer: { datasetId: "dataset-1", kind: "histogram" as const, bucketCount: 4 },
    });

    await waitFor(() => expect(engine.updateDataset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(engine.updateLayer).toHaveBeenCalledTimes(1));
    expect(engine.addDataset).toHaveBeenCalledTimes(1);
    expect(engine.addLayer).toHaveBeenCalledTimes(1);

    unmount();
    expect(engine.removeDataset).toHaveBeenCalledWith("dataset-1");
    expect(engine.removeLayer).toHaveBeenCalledWith("layer-1");
  });

  test("registers, clears, and removes layers", async () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const layer = { datasetId: "dataset-1", kind: "histogram" as const, bucketCount: 2 };
    const { result, rerender, unmount } = renderHook(({ value }) => useVizLayer(value), {
      initialProps: { value: null as typeof layer | null },
      wrapper,
    });

    expect(result.current).toBeNull();

    rerender({ value: layer });
    await waitFor(() => expect(result.current).toBe("layer-1"));
    expect(engine.addLayer).toHaveBeenCalledWith(layer);

    rerender({ value: null });
    await waitFor(() => expect(result.current).toBeNull());
    expect(engine.removeLayer).toHaveBeenCalledWith("layer-1");

    unmount();
    expect(engine.removeLayer).toHaveBeenCalledTimes(1);
  });

  test("computes frames from viewport and dependency changes", () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const viewport = { height: 320, width: 800, xDomain: [0, 40] as [number, number] };
    const { rerender } = renderHook(({ deps }) => useVizFrame(viewport, deps), {
      initialProps: { deps: ["dataset-1"] },
      wrapper,
    });

    expect(engine.computeFrame).toHaveBeenCalledWith({ viewport });

    rerender({ deps: ["dataset-2"] });
    expect(engine.computeFrame).toHaveBeenCalledTimes(2);
  });

  test("computes frames from object options", () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const viewport = { height: 320, width: 800, xDomain: [0, 40] as [number, number] };

    renderHook(
      () => useVizFrame({ dependencies: ["dataset-1"], frameFormat: "objects", viewport }),
      {
        wrapper,
      },
    );

    expect(engine.computeFrame).toHaveBeenCalledWith({ frameFormat: "objects", viewport });
  });

  test("computes typed frames from the convenience hook", () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const viewport = { height: 320, width: 800, xDomain: [0, 40] as [number, number] };

    renderHook(() => useVizTypedFrame({ dependencies: ["dataset-1"], viewport }), { wrapper });

    expect(engine.computeFrame).toHaveBeenCalledWith({ frameFormat: "typed", viewport });
  });

  test("computes typed frames with a table viewport", () => {
    const engine = createFakeEngine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VizEngineProvider engine={engine}>{children}</VizEngineProvider>
    );
    const viewport = { kind: "table" as const, rowLimit: 25, rowOffset: 10 };

    renderHook(() => useVizTypedFrame({ dependencies: ["dataset-1"], viewport }), { wrapper });

    expect(engine.computeFrame).toHaveBeenCalledWith({ frameFormat: "typed", viewport });
  });

  test("supports the thin lifecycle integration with a real engine", async () => {
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
                  targetBinCount: 2,
                  xDomain: [0, 10] as [number, number],
                }
              : null,
          [datasetId],
        );
        const layerId = useVizLayer(layer);
        const frame = useVizFrame({ height: 320, width: 800, xDomain: [0, 10] }, [
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
    expect(result.current.frame.stats.datasetCount).toBe(1);
  });
});
