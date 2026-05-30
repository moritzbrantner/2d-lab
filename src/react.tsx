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
  VizComputeFrameOptions,
  VizDataset,
  VizDatasetId,
  VizEngine,
  VizLayer,
  VizLayerId,
  VizRenderFrame,
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
  backend?: VizBackendOption;
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

export function useVizFrame<TProperties = Record<string, unknown>>(
  viewport: VizViewport,
  dependencies: readonly unknown[] = [],
): VizRenderFrame<TProperties> {
  const engine = useVizEngine<TProperties>();

  return useMemo(() => {
    void dependencies;

    return engine.computeFrame({ viewport } satisfies VizComputeFrameOptions);
  }, [engine, viewport, dependencies]);
}
