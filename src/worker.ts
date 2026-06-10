import { createAsyncVizEngine, type CreateAsyncVizEngineOptions } from "./lazy";
import {
  deserializeVizError,
  serializeVizError,
  VizAbortError,
  VizDisposedError,
  VizWorkerError,
  type SerializedVizEngineError,
} from "./errors";
import { getVizFrameTransferables } from "./transfer-frame";

export * from "./errors";

import type {
  VizAnyRenderFrame,
  VizComputeFrameOptions,
  VizDataset,
  VizDatasetId,
  VizLayer,
  VizLayerId,
  VizObjectComputeFrameOptions,
  VizRenderFrame,
  VizTypedComputeFrameOptions,
  VizTypedRenderFrame,
} from "./types";

export type VizWorkerClientOptions = {
  requestTimeoutMs?: number;
};

export type VizWorkerRequestOptions = {
  signal?: AbortSignal;
};

export type VizWorkerClient<TProperties = Record<string, unknown>> = {
  addDataset(dataset: VizDataset<TProperties>, transfer?: Transferable[]): Promise<VizDatasetId>;
  addLayer(layer: VizLayer): Promise<VizLayerId>;
  clear(): Promise<void>;
  computeFrame(
    options: VizTypedComputeFrameOptions,
    requestOptions?: VizWorkerRequestOptions,
  ): Promise<VizTypedRenderFrame<TProperties>>;
  computeFrame(
    options: VizObjectComputeFrameOptions,
    requestOptions?: VizWorkerRequestOptions,
  ): Promise<VizRenderFrame<TProperties>>;
  computeFrame(
    options: VizComputeFrameOptions,
    requestOptions?: VizWorkerRequestOptions,
  ): Promise<VizAnyRenderFrame<TProperties>>;
  dispose(): void;
  removeDataset(datasetId: VizDatasetId): Promise<void>;
  removeLayer(layerId: VizLayerId): Promise<void>;
  updateDataset(
    datasetId: VizDatasetId,
    dataset: VizDataset<TProperties>,
    transfer?: Transferable[],
  ): Promise<boolean>;
  updateLayer(layerId: VizLayerId, layer: VizLayer): Promise<boolean>;
};

type VizWorkerRequest<TProperties = Record<string, unknown>> =
  | { dataset: VizDataset<TProperties>; id: number; type: "addDataset" }
  | { dataset: VizDataset<TProperties>; datasetId: VizDatasetId; id: number; type: "updateDataset" }
  | { datasetId: VizDatasetId; id: number; type: "removeDataset" }
  | { id: number; layer: VizLayer; type: "addLayer" }
  | { id: number; layer: VizLayer; layerId: VizLayerId; type: "updateLayer" }
  | { id: number; layerId: VizLayerId; type: "removeLayer" }
  | { id: number; options: VizComputeFrameOptions; type: "computeFrame" }
  | { id: number; type: "clear" }
  | { id: number; type: "dispose" }
  | { id: number; type: "cancel" };

type VizWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { error: SerializedVizEngineError; id: number; ok: false };

type VizWorkerHostScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<VizWorkerRequest>) => void,
  ): void;
  close(): void;
  postMessage(message: VizWorkerResponse, transfer?: Transferable[]): void;
};

type PendingRequest = {
  reject(error: unknown): void;
  resolve(value: unknown): void;
  timeoutId?: ReturnType<typeof setTimeout>;
};

export function createVizWorkerClient<TProperties = Record<string, unknown>>(
  worker: Worker,
  options: VizWorkerClientOptions = {},
): VizWorkerClient<TProperties> {
  const pending = new Map<number, PendingRequest>();
  let nextRequestId = 0;
  let disposed = false;

  worker.addEventListener("message", (event: MessageEvent<VizWorkerResponse>) => {
    const response = event.data;
    if (!response || typeof response.id !== "number") {
      return;
    }

    const request = pending.get(response.id);
    if (!request) {
      return;
    }

    pending.delete(response.id);
    clearPendingTimeout(request);

    if (response.ok) {
      request.resolve(response.result);
    } else {
      request.reject(deserializeVizError(response.error));
    }
  });

  function request<TResult>(
    message: { type: string; [key: string]: unknown },
    transfer: Transferable[] = [],
    requestOptions: VizWorkerRequestOptions = {},
  ): Promise<TResult> {
    if (disposed) {
      return Promise.reject(new VizDisposedError("Viz worker client has been disposed."));
    }
    if (requestOptions.signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    const id = ++nextRequestId;
    const payload = { ...message, id } as VizWorkerRequest<TProperties>;

    return new Promise<TResult>((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        reject,
        resolve: resolve as (value: unknown) => void,
      };
      pending.set(id, pendingRequest);

      const abort = () => {
        if (!pending.delete(id)) {
          return;
        }
        clearPendingTimeout(pendingRequest);
        worker.postMessage({ id, type: "cancel" } satisfies VizWorkerRequest<TProperties>);
        reject(createAbortError());
      };

      if (requestOptions.signal) {
        requestOptions.signal.addEventListener("abort", abort, { once: true });
      }

      if (options.requestTimeoutMs && options.requestTimeoutMs > 0) {
        pendingRequest.timeoutId = setTimeout(() => {
          if (!pending.delete(id)) {
            return;
          }
          requestOptions.signal?.removeEventListener("abort", abort);
          worker.postMessage({ id, type: "cancel" } satisfies VizWorkerRequest<TProperties>);
          reject(
            new VizWorkerError("viz-worker-timeout", `Viz worker request ${id} timed out.`, {
              details: { requestId: id },
            }),
          );
        }, options.requestTimeoutMs);
      }

      try {
        worker.postMessage(payload, transfer);
      } catch (error) {
        pending.delete(id);
        clearPendingTimeout(pendingRequest);
        requestOptions.signal?.removeEventListener("abort", abort);
        reject(error);
      }
    });
  }

  const computeFrame = ((
    frameOptions: VizComputeFrameOptions,
    requestOptions?: VizWorkerRequestOptions,
  ) => {
    const optionsWithDefault = {
      frameFormat: "typed" as const,
      ...frameOptions,
    } as VizComputeFrameOptions;
    return request<VizAnyRenderFrame<TProperties>>(
      { options: optionsWithDefault, type: "computeFrame" },
      [],
      requestOptions,
    );
  }) as VizWorkerClient<TProperties>["computeFrame"];

  return {
    addDataset(dataset, transfer = []) {
      return request({ dataset, type: "addDataset" }, transfer);
    },
    addLayer(layer) {
      return request({ layer, type: "addLayer" });
    },
    clear() {
      return request({ type: "clear" });
    },
    computeFrame,
    dispose() {
      disposed = true;
      for (const [id, pendingRequest] of pending) {
        pending.delete(id);
        clearPendingTimeout(pendingRequest);
        pendingRequest.reject(new VizDisposedError("Viz worker client has been disposed."));
      }
      worker.terminate();
    },
    removeDataset(datasetId) {
      return request({ datasetId, type: "removeDataset" });
    },
    removeLayer(layerId) {
      return request({ layerId, type: "removeLayer" });
    },
    updateDataset(datasetId, dataset, transfer = []) {
      return request({ dataset, datasetId, type: "updateDataset" }, transfer);
    },
    updateLayer(layerId, layer) {
      return request({ layer, layerId, type: "updateLayer" });
    },
  };
}

export function createVizWorkerHost<TProperties = Record<string, unknown>>(
  scope: VizWorkerHostScope,
  options: CreateAsyncVizEngineOptions = {
    backend: "auto",
    wasm: { fallback: "js", loadPolicy: "on-demand" },
  },
): void {
  const enginePromise = createAsyncVizEngine<TProperties>(options);
  const cancelledRequests = new Set<number>();

  scope.addEventListener("message", (event: MessageEvent<VizWorkerRequest>) => {
    const request = event.data as VizWorkerRequest<TProperties>;
    if (!request || typeof request.id !== "number") {
      return;
    }

    if (request.type === "cancel") {
      cancelledRequests.add(request.id);
      return;
    }

    handleRequest(request).catch((error: unknown) => {
      postResponse(scope, request.id, {
        error: serializeVizError(error),
        id: request.id,
        ok: false,
      });
    });
  });

  async function handleRequest(request: VizWorkerRequest<TProperties>) {
    const engine = await enginePromise;
    if (cancelledRequests.has(request.id)) {
      cancelledRequests.delete(request.id);
      return;
    }

    switch (request.type) {
      case "addDataset":
        postResult(scope, request.id, engine.addDataset(request.dataset));
        return;
      case "updateDataset":
        postResult(scope, request.id, engine.updateDataset(request.datasetId, request.dataset));
        return;
      case "removeDataset":
        engine.removeDataset(request.datasetId);
        postResult(scope, request.id, undefined);
        return;
      case "addLayer":
        postResult(scope, request.id, engine.addLayer(request.layer));
        return;
      case "updateLayer":
        postResult(scope, request.id, engine.updateLayer(request.layerId, request.layer));
        return;
      case "removeLayer":
        engine.removeLayer(request.layerId);
        postResult(scope, request.id, undefined);
        return;
      case "computeFrame": {
        const frame = engine.computeFrame(request.options as VizTypedComputeFrameOptions);
        if (!cancelledRequests.has(request.id)) {
          postResult(
            scope,
            request.id,
            frame,
            getVizFrameTransferables(frame as VizAnyRenderFrame),
          );
        }
        cancelledRequests.delete(request.id);
        return;
      }
      case "clear":
        engine.clear();
        postResult(scope, request.id, undefined);
        return;
      case "dispose":
        engine.dispose();
        postResult(scope, request.id, undefined);
        scope.close();
        return;
      case "cancel":
        return;
    }
  }
}

function postResult(
  scope: VizWorkerHostScope,
  id: number,
  result: unknown,
  transfer: Transferable[] = [],
) {
  postResponse(scope, id, { id, ok: true, result }, transfer);
}

function postResponse(
  scope: VizWorkerHostScope,
  id: number,
  response: VizWorkerResponse,
  transfer: Transferable[] = [],
) {
  scope.postMessage(response, transfer);
}

function createAbortError() {
  return new VizAbortError("Viz worker request was aborted.");
}

function clearPendingTimeout(request: PendingRequest) {
  if (request.timeoutId) {
    clearTimeout(request.timeoutId);
  }
}
