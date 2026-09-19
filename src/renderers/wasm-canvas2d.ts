import { countPoints } from "../core/display-list";
import { flattenGeometry } from "../geometry/flatten";
import { loadVizRenderKernel } from "../wasm/kernel";
import { drawPreparedDisplayList } from "./draw-prepared";
import type { Renderer } from "./types";

export const wasmCanvas2dRenderer: Renderer = {
  id: "canvas2d-wasm-prepared",
  name: "Canvas 2D · Rust/WASM prepared geometry",
  async render(context, displayList, options) {
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
      drawMs: end - drawStart,
      commandCount: displayList.commands.length,
      pointCount: countPoints(displayList),
      wasmCalls: 1,
    };
  },
};
