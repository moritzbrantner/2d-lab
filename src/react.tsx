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

export function useVizDataset<TProperties = Record<string, unknown>>(
  input: VizDataset<TProperties> | readonly VizSeriesPoint<TProperties>[],
): VizDatasetId | null {
  const engine = useVizEngine<TProperties>();
  const idStore = useMemo(() => createIdStore<VizDatasetId>(), []);

  useEffect(() => {
    const dataset: VizDataset<TProperties> = isSeriesPointArray(input)
      ? { kind: "xy", points: input }
      : input;
    const nextDatasetId = engine.addDataset(dataset);

    idStore.set(nextDatasetId);
    idStore.emit();

    return () => {
      engine.removeDataset(nextDatasetId);
      if (idStore.getSnapshot() === nextDatasetId) {
        idStore.set(null);
        idStore.emit();
      }
    };
  }, [engine, idStore, input]);

  return useSyncExternalStore(idStore.subscribe, idStore.getSnapshot, idStore.getSnapshot);
}

function isSeriesPointArray<TProperties>(
  input: VizDataset<TProperties> | readonly VizSeriesPoint<TProperties>[],
): input is readonly VizSeriesPoint<TProperties>[] {
  return Array.isArray(input);
}

export function useVizLayer(layer: VizLayer | null): VizLayerId | null {
  const engine = useVizEngine();
  const idStore = useMemo(() => createIdStore<VizLayerId>(), []);

  useEffect(() => {
    if (!layer) {
      idStore.set(null);
      idStore.emit();
      return;
    }

    const nextLayerId = engine.addLayer(layer);

    idStore.set(nextLayerId);
    idStore.emit();

    return () => {
      engine.removeLayer(nextLayerId);
      if (idStore.getSnapshot() === nextLayerId) {
        idStore.set(null);
        idStore.emit();
      }
    };
  }, [engine, idStore, layer]);

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
  options: Omit<UseVizFrameOptions, "frameFormat" | "outputMode">,
): VizTypedRenderFrame<TProperties> {
  return useVizFrame<TProperties>({
    ...options,
    frameFormat: "typed",
  }) as VizTypedRenderFrame<TProperties>;
}

function isViewport(input: UseVizFrameOptions | VizViewport): input is VizViewport {
  return "width" in input && "height" in input && !("viewport" in input);
}
