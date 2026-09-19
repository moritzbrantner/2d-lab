import type { DisplayList } from "../core/display-list";
import { retainedWgpuRenderer } from "./retained-wgpu";
import type { Renderer, RenderOptions } from "./types";
import { wgpuPolygonRenderer } from "./wgpu";

export type CustomWgpuBackendId = "retained" | "immediate";

export interface ResolvedCustomWgpuBackend {
  readonly id: CustomWgpuBackendId;
  readonly label: string;
  readonly renderer: Renderer;
}

export function resolveCustomWgpuBackend(
  displayList: DisplayList,
  options: RenderOptions,
): ResolvedCustomWgpuBackend | string {
  const retainedError = retainedWgpuRenderer.support(displayList, options);
  if (!retainedError) {
    return {
      id: "retained",
      label: "retained WebGPU",
      renderer: retainedWgpuRenderer,
    };
  }

  const immediateError = wgpuPolygonRenderer.support(displayList, options);
  if (!immediateError) {
    return {
      id: "immediate",
      label: "immediate WebGPU",
      renderer: wgpuPolygonRenderer,
    };
  }

  return [
    "No Rust/WASM + wgpu custom backend preserves this workload's semantics.",
    `retained: ${retainedError}`,
    `immediate: ${immediateError}`,
  ].join(" ");
}

export const customWgpuRenderer: Renderer = {
  id: "custom-rust-wasm-wgpu",
  name: "2d-lab custom · Rust/WASM + wgpu",
  support(displayList, options) {
    const resolved = resolveCustomWgpuBackend(displayList, options);
    return typeof resolved === "string" ? resolved : null;
  },
  async render(canvas, displayList, options) {
    const resolved = resolveCustomWgpuBackend(displayList, options);
    if (typeof resolved === "string") {
      throw new Error(resolved);
    }
    return resolved.renderer.render(canvas, displayList, options);
  },
  async dispose(canvas) {
    await retainedWgpuRenderer.dispose?.(canvas);
    await wgpuPolygonRenderer.dispose?.(canvas);
  },
};
