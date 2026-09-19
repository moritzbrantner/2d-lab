import { countPoints } from "../core/display-list";
import { flattenGeometry } from "../geometry/flatten";
import { transformBatches } from "../geometry/transform";
import { drawPreparedDisplayList } from "./draw-prepared";
import type { Renderer } from "./types";

export const canvas2dRenderer: Renderer = {
  id: "canvas2d-ts",
  name: "Canvas 2D · TypeScript prepared geometry",
  async render(context, displayList, options) {
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
      drawMs: end - drawStart,
      commandCount: displayList.commands.length,
      pointCount: countPoints(displayList),
      wasmCalls: 0,
    };
  },
};
