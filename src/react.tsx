import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { createVizEngine } from "./create-viz-engine";

import type {
  VizBackendOption,
  VizBackendConfig,
  VizAnyRenderFrame,
  VizComputeFrameOptions,
  VizDataset,
  VizDatasetId,
  VizEngine,
  VizLayer,
  VizLayerId,
  VizObjectComputeFrameOptions,
  VizRenderFrame,
  VizTypedRenderFrame,
  VizSeriesPoint,
  VizViewport,
} from "./types";

const VizEngineContext = createContext<VizEngine | null>(null);

type IdStore<TId extends string> = {
  emit: () => void;
  getSnapshot: () => TId | null;
  set: (value: TId | null) => void;
  subscribe: (listener: () => void) => () => void;
};

function createIdStore<TId extends string>(): IdStore<TId> {
  let value: TId | null = null;
  const listeners = new Set<() => void>();

  return {
    emit() {
      for (const listener of listeners) {
        listener();
      }
    },
    getSnapshot() {
      return value;
    },
    set(nextValue) {
      value = nextValue;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type VizEngineProviderProps = {
  backend?: VizBackendOption | VizBackendConfig;
  children: ReactNode;
  engine?: VizEngine;
};

export function VizEngineProvider({ backend = "auto", children, engine }: VizEngineProviderProps) {
  const ownedEngine = useMemo(() => engine ?? createVizEngine({ backend }), [backend, engine]);

  return <VizEngineContext.Provider value={ownedEngine}>{children}</VizEngineContext.Provider>;
}

export function useVizEngine<TProperties = Record<string, unknown>>() {
  const engine = useContext(VizEngineContext);

  if (!engine) {
    throw new Error("useVizEngine must be used within a VizEngineProvider.");
  }

  return engine as VizEngine<TProperties>;
}

export type UseVizDatasetOptions = {
  lifecycle?: "recreate" | "update";
};

export function useVizDataset<TProperties = Record<string, unknown>>(
  input: VizDataset<TProperties> | readonly VizSeriesPoint<TProperties>[],
  options: UseVizDatasetOptions = {},
): VizDatasetId | null {
  const engine = useVizEngine<TProperties>();
  const idStore = useMemo(() => createIdStore<VizDatasetId>(), []);
  const lifecycle = options.lifecycle ?? "recreate";

  useEffect(() => {
    const dataset: VizDataset<TProperties> = isSeriesPointArray(input)
      ? { kind: "xy", points: input }
      : input;
    const currentDatasetId = idStore.getSnapshot();
    const didUpdate =
      lifecycle === "update" &&
      currentDatasetId != null &&
      engine.updateDataset(currentDatasetId, dataset);
    if (lifecycle === "update" && currentDatasetId && !didUpdate) {
      engine.removeDataset(currentDatasetId);
    }
    const nextDatasetId = didUpdate ? currentDatasetId : engine.addDataset(dataset);

    idStore.set(nextDatasetId);
    idStore.emit();

    return () => {
      if (lifecycle === "update" && idStore.getSnapshot() === nextDatasetId) {
        return;
      }

      engine.removeDataset(nextDatasetId);
      if (idStore.getSnapshot() === nextDatasetId && lifecycle !== "update") {
        idStore.set(null);
        idStore.emit();
      }
    };
  }, [engine, idStore, input, lifecycle]);

  useEffect(
    () => () => {
      const datasetId = idStore.getSnapshot();
      if (datasetId) {
        engine.removeDataset(datasetId);
        idStore.set(null);
        idStore.emit();
      }
    },
    [engine, idStore],
  );

  return useSyncExternalStore(idStore.subscribe, idStore.getSnapshot, idStore.getSnapshot);
}

function isSeriesPointArray<TProperties>(
  input: VizDataset<TProperties> | readonly VizSeriesPoint<TProperties>[],
): input is readonly VizSeriesPoint<TProperties>[] {
  return Array.isArray(input);
}

export type UseVizLayerOptions = {
  lifecycle?: "recreate" | "update";
};

export function useVizLayer(
  layer: VizLayer | null,
  options: UseVizLayerOptions = {},
): VizLayerId | null {
  const engine = useVizEngine();
  const idStore = useMemo(() => createIdStore<VizLayerId>(), []);
  const lifecycle = options.lifecycle ?? "recreate";

  useEffect(() => {
    if (!layer) {
      const currentLayerId = idStore.getSnapshot();
      if (currentLayerId) {
        engine.removeLayer(currentLayerId);
      }
      idStore.set(null);
      idStore.emit();
      return;
    }

    const currentLayerId = idStore.getSnapshot();
    const didUpdate =
      lifecycle === "update" && currentLayerId != null && engine.updateLayer(currentLayerId, layer);
    if (lifecycle === "update" && currentLayerId && !didUpdate) {
      engine.removeLayer(currentLayerId);
    }
    const nextLayerId = didUpdate ? currentLayerId : engine.addLayer(layer);

    idStore.set(nextLayerId);
    idStore.emit();

    return () => {
      if (lifecycle === "update" && idStore.getSnapshot() === nextLayerId) {
        return;
      }

      engine.removeLayer(nextLayerId);
      if (idStore.getSnapshot() === nextLayerId && lifecycle !== "update") {
        idStore.set(null);
        idStore.emit();
      }
    };
  }, [engine, idStore, layer, lifecycle]);

  useEffect(
    () => () => {
      const layerId = idStore.getSnapshot();
      if (layerId) {
        engine.removeLayer(layerId);
        idStore.set(null);
        idStore.emit();
      }
    },
    [engine, idStore],
  );

  return useSyncExternalStore(idStore.subscribe, idStore.getSnapshot, idStore.getSnapshot);
}

export type UseVizFrameOptions = VizComputeFrameOptions & {
  dependencies?: readonly unknown[];
};

export function useVizFrame<TProperties = Record<string, unknown>>(
  options: UseVizFrameOptions & VizObjectComputeFrameOptions,
): VizRenderFrame<TProperties>;
export function useVizFrame<TProperties = Record<string, unknown>>(
  options: UseVizFrameOptions,
): VizTypedRenderFrame<TProperties> | VizRenderFrame<TProperties>;
/** @deprecated Pass a UseVizFrameOptions object instead. */
export function useVizFrame<TProperties = Record<string, unknown>>(
  viewport: VizViewport,
  dependencies?: readonly unknown[],
): VizTypedRenderFrame<TProperties>;
export function useVizFrame<TProperties = Record<string, unknown>>(
  input: UseVizFrameOptions | VizViewport,
  legacyDependencies: readonly unknown[] = [],
): VizRenderFrame<TProperties> | VizTypedRenderFrame<TProperties> {
  const engine = useVizEngine<TProperties>();
  const options = isViewport(input)
    ? {
        dependencies: legacyDependencies,
        viewport: input,
      }
    : input;

  return useMemo(() => {
    void options.dependencies;

    const { dependencies: _dependencies, ...frameOptions } = options;
    return (
      engine.computeFrame as (options: VizComputeFrameOptions) => VizAnyRenderFrame<TProperties>
    )(frameOptions satisfies VizComputeFrameOptions);
  }, [engine, options]);
}

export function useVizTypedFrame<TProperties = Record<string, unknown>>(
  options: Omit<UseVizFrameOptions, "frameFormat">,
): VizTypedRenderFrame<TProperties> {
  return useVizFrame<TProperties>({
    ...options,
    frameFormat: "typed",
  }) as VizTypedRenderFrame<TProperties>;
}

function isViewport(input: UseVizFrameOptions | VizViewport): input is VizViewport {
  return "width" in input && "height" in input && !("viewport" in input);
}
