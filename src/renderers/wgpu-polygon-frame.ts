import type { DisplayList, PathCommand } from "../core/display-list";
import { parseHexColor } from "../geometry/color";
import { flattenGeometry } from "../geometry/flatten";
import type { RenderOptions } from "./types";

export interface PackedPolygonFrame {
  readonly points: Float32Array;
  readonly spans: Uint32Array;
  readonly transforms: Float32Array;
  readonly colors: Float32Array;
  readonly background: Float32Array;
}

export function polygonRendererSupportError(
  displayList: DisplayList,
  options: RenderOptions,
): string | null {
  if (options.debugBounds) {
    return "The first WebGPU slice does not render debug bounds yet.";
  }
  const background = parseHexColor(displayList.background);
  if (!background) {
    return "The first WebGPU slice requires a hex background color.";
  }
  if (background[3] !== 1) {
    return "The first WebGPU slice requires an opaque background.";
  }

  for (const [index, command] of displayList.commands.entries()) {
    if (!command.closed) {
      return `WebGPU command ${index} is open; the first slice supports closed polygons only.`;
    }
    if (!command.paint.fill) {
      return `WebGPU command ${index} has no fill.`;
    }
    if (command.paint.stroke) {
      return `WebGPU command ${index} has a stroke; stroke tessellation is a later slice.`;
    }
    if (!parseHexColor(command.paint.fill)) {
      return `WebGPU command ${index} uses a non-hex fill color.`;
    }
    if (command.points.length < 6) {
      return `WebGPU command ${index} has fewer than three points.`;
    }
    if (!isConvexPolygon(command)) {
      return `WebGPU command ${index} is concave or degenerate; lyon tessellation is a later slice.`;
    }
  }

  return null;
}

export function packPolygonFrame(
  displayList: DisplayList,
): PackedPolygonFrame {
  const supportError = polygonRendererSupportError(displayList, {
    debugBounds: false,
  });
  if (supportError) {
    throw new Error(supportError);
  }

  const geometry = flattenGeometry(displayList);
  const colors = new Float32Array(displayList.commands.length * 4);

  for (const [index, command] of displayList.commands.entries()) {
    const color = parseHexColor(command.paint.fill!);
    if (!color) {
      throw new Error(`command ${index} fill could not be encoded as RGBA`);
    }
    colors.set(color, index * 4);
  }

  const background = parseHexColor(displayList.background);
  if (!background) {
    throw new Error("background could not be encoded as RGBA");
  }

  return {
    ...geometry,
    colors,
    background: new Float32Array(background),
  };
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
