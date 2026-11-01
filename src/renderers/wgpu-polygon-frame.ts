import type { DisplayList } from "../core/display-list";
import { parseHexColor, parsePaintColor } from "../geometry/color";
import { packVelloFrame, type PackedVelloFrame } from "./vello-frame";
import type { RenderOptions } from "./types";

/**
 * The custom immediate path's input: exactly the Vello frame, so both renderers receive identical
 * geometry, path verbs, paint and stroke style.
 */
export type PackedPolygonFrame = PackedVelloFrame;

/**
 * Why the custom immediate path cannot render `displayList`. It fills any path (lines and cubics,
 * convex or not, nonzero or even-odd: lyon's fill tessellator) and strokes it with Canvas width,
 * caps, joins and miter limit (lyon's stroke tessellator).
 */
export function polygonRendererSupportError(
  displayList: DisplayList,
  options: RenderOptions,
): string | null {
  if (options.debugBounds) {
    return "The custom WebGPU path does not render debug bounds yet.";
  }
  const background = parseHexColor(displayList.background);
  if (!background) {
    return "The custom WebGPU path requires a hex background color.";
  }
  if (background[3] !== 1) {
    return "The custom WebGPU path requires an opaque background.";
  }

  for (const [index, command] of displayList.commands.entries()) {
    if (command.paint.fill) {
      if (!parsePaintColor(command.paint.fill)) {
        return `WebGPU command ${index} uses an unsupported fill color.`;
      }
      if (!command.segments && command.points.length < 6) {
        return `WebGPU command ${index} fills fewer than three points.`;
      }
    }
    if (command.paint.stroke && !parsePaintColor(command.paint.stroke)) {
      return `WebGPU command ${index} uses an unsupported stroke color.`;
    }
  }

  return null;
}

export function packPolygonFrame(displayList: DisplayList): PackedPolygonFrame {
  const supportError = polygonRendererSupportError(displayList, {
    debugBounds: false,
  });
  if (supportError) {
    throw new Error(supportError);
  }
  return packVelloFrame(displayList);
}
