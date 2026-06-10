import type { VizDatasetIndex } from "./types";

export type VizDisposable = {
  dispose?(): void;
  free?(): void;
};

export function disposeVizIndex<TProperties>(index: VizDatasetIndex<TProperties>): void {
  disposeValue(index.index);
}

export function isWasmDatasetIndex<TProperties>(index: VizDatasetIndex<TProperties>): boolean {
  return index.index.getBackendCapabilities().usesWasm;
}

function disposeValue(value: unknown): void {
  const disposable = value as VizDisposable | null;
  if (!disposable || typeof disposable !== "object") {
    return;
  }

  if (typeof disposable.dispose === "function") {
    disposable.dispose();
    return;
  }

  if (typeof disposable.free === "function") {
    disposable.free();
  }
}
