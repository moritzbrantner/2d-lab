import { describe, expect, test, vi } from "vitest";

import { VizBackendError } from "./errors";
import { createVizWorkerClient, createVizWorkerHost } from "./worker";

import type { VizWorkerClient } from "./worker";
import type { VizWasmLoader } from "./wasm/types";

describe("worker API", () => {
  test("keeps datasets in the host and returns typed frames", async () => {
    const { client } = createTestWorkerPair();
    const datasetId = await client.addDataset({
      kind: "xy",
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
      ],
    });

    await client.addLayer({ datasetId, kind: "heatmap", xBinCount: 2, yBinCount: 2 });

    const frame = await client.computeFrame({
      viewport: { height: 120, width: 240, xDomain: [0, 1] },
    });

    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0]).toMatchObject({ kind: "heatmap" });
    expect("typedHeatmap" in frame.layers[0]!).toBe(true);
  });

  test("supports object frame requests", async () => {
    const { client } = createTestWorkerPair();
    const datasetId = await client.addDataset({
      kind: "xy",
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
      ],
    });

    await client.addLayer({ datasetId, kind: "binned-series", targetBinCount: 2 });

    const frame = await client.computeFrame({
      frameFormat: "objects",
      viewport: { height: 120, width: 240, xDomain: [0, 1] },
    });

    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0]).toMatchObject({ kind: "binned-series" });
    expect("series" in frame.layers[0]!).toBe(true);
  });

  test("client timeout rejects with a worker timeout code", async () => {
    vi.useFakeTimers();
    try {
      const client = createVizWorkerClient(createSilentWorker(), { requestTimeoutMs: 10 });
      const errorPromise = client
        .computeFrame({ viewport: { height: 120, width: 240, xDomain: [0, 1] } })
        .catch((error: unknown) => error);

      vi.advanceTimersByTime(10);

      await expect(errorPromise).resolves.toMatchObject({ code: "viz-worker-timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("disposed client rejects new requests", async () => {
    const client = createVizWorkerClient(createSilentWorker());

    client.dispose();

    await expect(
      client.addLayer({ datasetId: "dataset-1", kind: "binned-series", targetBinCount: 2 }),
    ).rejects.toMatchObject({ code: "viz-disposed" });
  });

  test("aborted request rejects with an abort code", async () => {
    const client = createVizWorkerClient(createSilentWorker());
    const controller = new AbortController();
    const errorPromise = client
      .computeFrame(
        { viewport: { height: 120, width: 240, xDomain: [0, 1] } },
        { signal: controller.signal },
      )
      .catch((error: unknown) => error);

    controller.abort();

    await expect(errorPromise).resolves.toMatchObject({ code: "viz-aborted" });
  });

  test("host VizEngineError responses preserve serialized fields", async () => {
    const { scope, worker } = createWorkerBridge();
    const loader = {
      getError: vi.fn(() => null),
      getState: vi.fn(() => "idle" as const),
      load: vi.fn(async () => {
        throw new VizBackendError("viz-backend-unavailable", "preload failed", {
          details: { phase: "preload" },
        });
      }),
      preload: vi.fn(async () => {}),
    } satisfies VizWasmLoader;
    createVizWorkerHost(scope, {
      backend: "wasm",
      wasm: { fallback: "error", loadPolicy: "preload", loader },
    });
    const client = createVizWorkerClient(worker);
    const received = await client
      .addLayer({ datasetId: "dataset-1", kind: "binned-series", targetBinCount: 2 })
      .catch((caught: unknown) => caught);

    expect(received).toMatchObject({
      code: "viz-wasm-unavailable",
      message: "Viz Engine WASM preload failed.",
      name: "VizWasmUnavailableError",
    });
    expect(loader.load).toHaveBeenCalledTimes(1);
  });
});

function createSilentWorker(): Worker {
  const mainListeners = new Set<(event: MessageEvent) => void>();

  return {
    addEventListener(type: "message", listener: (event: MessageEvent) => void) {
      if (type === "message") {
        mainListeners.add(listener);
      }
    },
    postMessage() {},
    terminate() {
      mainListeners.clear();
    },
  } as unknown as Worker;
}

function createWorkerBridge() {
  const mainListeners = new Set<(event: MessageEvent) => void>();
  const hostListeners = new Set<(event: MessageEvent) => void>();

  const worker = {
    addEventListener(type: "message", listener: (event: MessageEvent) => void) {
      if (type === "message") {
        mainListeners.add(listener);
      }
    },
    postMessage(message: unknown) {
      queueMicrotask(() => {
        for (const listener of hostListeners) {
          listener({ data: message } as MessageEvent);
        }
      });
    },
    terminate() {
      mainListeners.clear();
      hostListeners.clear();
    },
  } as unknown as Worker;

  const scope = {
    addEventListener(type: "message", listener: (event: MessageEvent) => void) {
      if (type === "message") {
        hostListeners.add(listener);
      }
    },
    close() {
      hostListeners.clear();
    },
    postMessage(message: unknown) {
      queueMicrotask(() => {
        for (const listener of mainListeners) {
          listener({ data: message } as MessageEvent);
        }
      });
    },
  } as Parameters<typeof createVizWorkerHost>[0];

  return { scope, worker };
}

function createTestWorkerPair(): { client: VizWorkerClient; worker: Worker } {
  const { scope, worker } = createWorkerBridge();
  createVizWorkerHost(scope, { backend: "js", wasm: { loadPolicy: "never" } });

  return {
    client: createVizWorkerClient(worker),
    worker,
  };
}
