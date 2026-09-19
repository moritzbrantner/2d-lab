import { countPoints } from "../core/display-list";
import {
  loadCustomWgpuModule,
  type WgpuPolygonRendererWasm,
} from "../wasm/kernel";
import { ensureCanvasSize } from "./canvas-surface";
import type { Renderer } from "./types";
import {
  packPolygonFrame,
  polygonRendererSupportError,
} from "./wgpu-polygon-frame";

const rendererByCanvas = new WeakMap<
  HTMLCanvasElement,
  Promise<WgpuPolygonRendererWasm>
>();

async function rendererFor(
  canvas: HTMLCanvasElement,
): Promise<WgpuPolygonRendererWasm> {
  let pending = rendererByCanvas.get(canvas);
  if (!pending) {
    pending = (async () => {
      const module = await loadCustomWgpuModule();
      return module.createWgpuPolygonRenderer(canvas);
    })().catch((error: unknown) => {
      rendererByCanvas.delete(canvas);
      throw error;
    });
    rendererByCanvas.set(canvas, pending);
  }
  return pending;
}

export const wgpuPolygonRenderer: Renderer = {
  id: "wgpu-rust-polygons",
  name: "WebGPU · Rust/WASM convex polygons",
  support(displayList, options) {
    return polygonRendererSupportError(displayList, options);
  },
  async render(canvas, displayList, options) {
    const supportError = polygonRendererSupportError(displayList, options);
    if (supportError) {
      throw new Error(supportError);
    }

    ensureCanvasSize(canvas, displayList);

    const packStart = performance.now();
    const packed = packPolygonFrame(displayList);
    const packedMs = performance.now() - packStart;

    const renderer = await rendererFor(canvas);
    if (renderer.isDeviceLost()) {
      throw new Error("The WebGPU device was lost.");
    }

    const metrics = renderer.render(
      packed.points,
      packed.spans,
      packed.transforms,
      packed.colors,
      packed.background,
      displayList.width,
      displayList.height,
    );

    return {
      prepareMs: packedMs + (metrics[0] ?? 0),
      uploadMs: metrics[1] ?? 0,
      renderMs: metrics[2] ?? 0,
      commandCount: displayList.commands.length,
      pointCount: countPoints(displayList),
      wasmCalls: 1,
      vertexCount: Math.trunc(metrics[3] ?? 0),
      uploadBytes: Math.trunc(metrics[4] ?? 0),
      drawCalls: Math.trunc(metrics[5] ?? 0),
    };
  },
  async dispose(canvas) {
    const pending = rendererByCanvas.get(canvas);
    rendererByCanvas.delete(canvas);
    if (!pending) {
      return;
    }

    try {
      const renderer = await pending;
      renderer.free?.();
    } catch {
      // Initialization failure already surfaced through render().
    }
  },
};
