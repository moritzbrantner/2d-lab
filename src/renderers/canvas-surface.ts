import type { DisplayList } from "../core/display-list";

export function ensureCanvasSize(
  canvas: HTMLCanvasElement,
  displayList: DisplayList,
): void {
  if (
    canvas.width !== displayList.width ||
    canvas.height !== displayList.height
  ) {
    canvas.width = displayList.width;
    canvas.height = displayList.height;
  }
}

export function requireCanvas2DContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable");
  }
  return context;
}

export function countCanvasDrawCalls(
  displayList: DisplayList,
  debugBounds: boolean,
): number {
  let drawCalls = 0;
  for (const command of displayList.commands) {
    if (command.paint.fill) {
      drawCalls += 1;
    }
    if (command.paint.stroke) {
      drawCalls += 1;
    }
    if (debugBounds) {
      drawCalls += 1;
    }
  }
  return drawCalls;
}
