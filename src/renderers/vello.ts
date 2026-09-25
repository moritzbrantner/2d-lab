import { countPoints } from "../core/display-list";
import {
  loadVizRenderModule,
  type VelloGpuRendererWasm,
} from "../wasm/kernel";
import { ensureCanvasSize } from "./canvas-surface";
import type { Renderer } from "./types";
import { packVelloFrame, velloSupportError } from "./vello-frame";

const rendererByCanvas = new WeakMap<
  HTMLCanvasElement,
  Promise<VelloGpuRendererWasm>
>();

async function rendererFor(
  canvas: HTMLCanvasElement,
): Promise<VelloGpuRendererWasm> {
  let pending = rendererByCanvas.get(canvas);
  if (!pending) {
    pending = (async () => {
      const module = await loadVizRenderModule();
      if (!module.createVelloGpuRenderer) {
        throw new Error(
          "This WASM package does not expose the pinned Vello GPU renderer.",
        );
      }
      return module.createVelloGpuRenderer(canvas);
    })().catch((error: unknown) => {
      rendererByCanvas.delete(canvas);
      throw error;
    });
    rendererByCanvas.set(canvas, pending);
  }
  return pending;
}

export const velloGpuRenderer: Renderer = {
  id: "vello-gpu",
  name: "Vello GPU · pinned upstream",
  support(displayList, options) {
    return velloSupportError(displayList, options);
  },
  async render(canvas, displayList, options) {
    const supportError = velloSupportError(displayList, options);
    if (supportError) {
      throw new Error(supportError);
    }

    ensureCanvasSize(canvas, displayList);
    const packStart = performance.now();
    const packed = packVelloFrame(displayList);
    const adapterPrepareMs = performance.now() - packStart;

    const renderer = await rendererFor(canvas);
    if (renderer.isDeviceLost()) {
      throw new Error("The Vello WebGPU device was lost.");
    }

    const metrics = renderer.render(
      packed.points,
      packed.spans,
      packed.verbs,
      packed.verbSpans,
      packed.transforms,
      packed.fillColors,
      packed.strokeColors,
      packed.strokeWidths,
      packed.flags,
      packed.background,
      displayList.width,
      displayList.height,
    );

    return {
      prepareMs: adapterPrepareMs + (metrics[0] ?? 0),
      uploadMs: 0,
      renderMs: metrics[1] ?? 0,
      commandCount: displayList.commands.length,
      pointCount: countPoints(displayList),
      wasmCalls: 1,
      drawCalls: null,
      vertexCount: null,
      uploadBytes: null,
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
