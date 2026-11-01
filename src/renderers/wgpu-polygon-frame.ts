import type { DisplayList, PathCommand } from "../core/display-list";
import { parseHexColor, parsePaintColor } from "../geometry/color";
import { packVelloFrame, type PackedVelloFrame } from "./vello-frame";
import type { RenderOptions } from "./types";

/**
 * The custom immediate path's input: the Vello frame without path verbs (the custom path draws
 * straight edges only), so both renderers receive identical geometry, paint and stroke style.
 */
export type PackedPolygonFrame = Omit<PackedVelloFrame, "verbs" | "verbSpans">;

/**
 * Why the custom immediate path cannot render `displayList`: it fills convex polygons and strokes
 * straight-edged paths (Canvas width, caps, joins and miter limit, tessellated with lyon).
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
    if (command.segments) {
      return `WebGPU command ${index} uses explicit path segments; custom polygon rendering supports straight edges only.`;
    }
    if (command.paint.fill) {
      if (!parsePaintColor(command.paint.fill)) {
        return `WebGPU command ${index} uses an unsupported fill color.`;
      }
      if (command.points.length < 6) {
        return `WebGPU command ${index} fills fewer than three points.`;
      }
      if (!isConvexPolygon(command)) {
        return `WebGPU command ${index} is concave or degenerate; lyon fill tessellation is a later slice.`;
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
  const { verbs: _verbs, verbSpans: _verbSpans, ...frame } =
    packVelloFrame(displayList);
  return frame;
}

function isConvexPolygon(command: PathCommand): boolean {
  const pointCount = command.points.length / 2;
  let orientation = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const first = point(command, index);
    const second = point(command, (index + 1) % pointCount);
    const third = point(command, (index + 2) % pointCount);
    const cross =
      (second[0] - first[0]) * (third[1] - second[1]) -
      (second[1] - first[1]) * (third[0] - second[0]);

    if (Math.abs(cross) <= 1e-5) {
      continue;
    }

    const sign = Math.sign(cross);
    if (orientation === 0) {
      orientation = sign;
    } else if (orientation !== sign) {
      return false;
    }
  }

  return orientation !== 0;
}

function point(command: PathCommand, index: number): readonly [number, number] {
  return [
    command.points[index * 2] ?? 0,
    command.points[index * 2 + 1] ?? 0,
  ];
}
