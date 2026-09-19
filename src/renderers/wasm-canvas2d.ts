import { countPoints } from "../core/display-list";
import { flattenGeometry } from "../geometry/flatten";
import { loadVizRenderKernel } from "../wasm/kernel";
import {
  countCanvasDrawCalls,
  ensureCanvasSize,
  requireCanvas2DContext,
} from "./canvas-surface";
import { drawPreparedDisplayList } from "./draw-prepared";
import type { Renderer } from "./types";

export const wasmCanvas2dRenderer: Renderer = {
  id: "canvas2d-wasm-prepared",
  name: "Canvas 2D · Rust/WASM prepared geometry",
  support() {
    return null;
  },
  async render(canvas, displayList, options) {
    ensureCanvasSize(canvas, displayList);
    const context = requireCanvas2DContext(canvas);

    const prepareStart = performance.now();
    const flattened = flattenGeometry(displayList);
    const kernel = await loadVizRenderKernel();
    const preparedPoints = kernel.transform_batches(
      flattened.points,
      flattened.spans,
      flattened.transforms,
    );
    const drawStart = performance.now();

    drawPreparedDisplayList(
      context,
      displayList,
      preparedPoints,
      options.debugBounds,
    );

    const end = performance.now();
    return {
      prepareMs: drawStart - prepareStart,
      uploadMs: 0,
      renderMs: end - drawStart,
      commandCount: displayList.commands.length,
      pointCount: countPoints(displayList),
      wasmCalls: 1,
      drawCalls: countCanvasDrawCalls(displayList, options.debugBounds),
      vertexCount: 0,
      uploadBytes: 0,
    };
  },
};
