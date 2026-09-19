import type { DisplayList } from "../core/display-list";
import { parseHexColor } from "../geometry/color";
import { flattenGeometry } from "../geometry/flatten";
import type { RenderOptions } from "./types";

const FLAG_CLOSED = 1;
const FLAG_FILL = 2;
const FLAG_STROKE = 4;

export interface PackedVelloFrame {
  readonly points: Float32Array;
  readonly spans: Uint32Array;
  readonly transforms: Float32Array;
  readonly fillColors: Float32Array;
  readonly strokeColors: Float32Array;
  readonly strokeWidths: Float32Array;
  readonly flags: Uint32Array;
  readonly background: Float32Array;
}

export function velloSupportError(
  displayList: DisplayList,
  options: RenderOptions,
): string | null {
  if (options.debugBounds) {
    return "The Vello comparison does not render viz-engine debug bounds.";
  }

  const background = parseHexColor(displayList.background);
  if (!background) {
    return "The Vello comparison currently requires a hex background.";
  }
  if (background[3] !== 1) {
    return "The Vello comparison currently requires an opaque background.";
  }

  for (const [index, command] of displayList.commands.entries()) {
    if (command.paint.fill && !parseHexColor(command.paint.fill)) {
      return `Vello command ${index} uses a non-hex fill.`;
    }
    if (command.paint.stroke && !parseHexColor(command.paint.stroke)) {
      return `Vello command ${index} uses a non-hex stroke.`;
    }
  }

  return null;
}

export function packVelloFrame(displayList: DisplayList): PackedVelloFrame {
  const error = velloSupportError(displayList, { debugBounds: false });
  if (error) {
    throw new Error(error);
  }

  const geometry = flattenGeometry(displayList);
  const count = displayList.commands.length;
  const fillColors = new Float32Array(count * 4);
  const strokeColors = new Float32Array(count * 4);
  const strokeWidths = new Float32Array(count);
  const flags = new Uint32Array(count);

  for (const [index, command] of displayList.commands.entries()) {
    let commandFlags = command.closed ? FLAG_CLOSED : 0;

    if (command.paint.fill) {
      const color = parseHexColor(command.paint.fill);
      if (!color) {
        throw new Error(`command ${index} fill could not be encoded`);
      }
      fillColors.set(color, index * 4);
      commandFlags |= FLAG_FILL;
    }

    if (command.paint.stroke) {
      const color = parseHexColor(command.paint.stroke);
      if (!color) {
        throw new Error(`command ${index} stroke could not be encoded`);
      }
      strokeColors.set(color, index * 4);
      commandFlags |= FLAG_STROKE;
    }

    strokeWidths[index] = command.paint.strokeWidth ?? 1;
    flags[index] = commandFlags;
  }

  const background = parseHexColor(displayList.background);
  if (!background) {
    throw new Error("background could not be encoded");
  }

  return {
    ...geometry,
    fillColors,
    strokeColors,
    strokeWidths,
    flags,
    background: new Float32Array(background),
  };
}
