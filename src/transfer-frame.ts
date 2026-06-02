import type { VizAnyRenderFrame } from "./types";

export function getVizFrameTransferables(frame: VizAnyRenderFrame): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();

  for (const layer of frame.layers) {
    collectTypedArrays(layer, buffers);
  }

  return [...buffers];
}

function collectTypedArrays(value: unknown, buffers: Set<ArrayBuffer>) {
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) {
      buffers.add(value.buffer);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const child of Object.values(value)) {
    collectTypedArrays(child, buffers);
  }
}
