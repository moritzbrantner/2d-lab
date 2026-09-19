import { countPoints } from "../core/display-list";
import { flattenGeometry } from "../geometry/flatten";
import { transformBatches } from "../geometry/transform";
import {
  countCanvasDrawCalls,
  ensureCanvasSize,
  requireCanvas2DContext,
} from "./canvas-surface";
import { drawPreparedDisplayList } from "./draw-prepared";
import type { Renderer } from "./types";

export const canvas2dRenderer: Renderer = {
  id: "canvas2d-ts",
  name: "Canvas 2D · TypeScript prepared geometry",
  support() {
    return null;
  },
  async render(canvas, displayList, options) {
    ensureCanvasSize(canvas, displayList);
    const context = requireCanvas2DContext(canvas);

    const prepareStart = performance.now();
    const flattened = flattenGeometry(displayList);
    const preparedPoints = transformBatches(flattened);
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
      wasmCalls: 0,
      drawCalls: countCanvasDrawCalls(displayList, options.debugBounds),
      vertexCount: 0,
      uploadBytes: 0,
    };
  },
};
