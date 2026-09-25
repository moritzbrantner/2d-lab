import type { DisplayList } from "../core/display-list";
import { parseHexColor, parsePaintColor } from "../geometry/color";
import { flattenGeometry } from "../geometry/flatten";
import type { RenderOptions } from "./types";

const FLAG_CLOSED = 1;
const FLAG_FILL = 2;
const FLAG_STROKE = 4;
const VERB_LINE = 0;
const VERB_CUBIC = 1;

export type PackedVelloFrame = {
  readonly points: Float32Array;
  readonly spans: Uint32Array;
  readonly verbs: Uint32Array;
  readonly verbSpans: Uint32Array;
  readonly transforms: Float32Array;
  readonly fillColors: Float32Array;
  readonly strokeColors: Float32Array;
  readonly strokeWidths: Float32Array;
  readonly flags: Uint32Array;
  readonly background: Float32Array;
};

export function velloSupportError(
  displayList: DisplayList,
  options: RenderOptions,
): string | null {
  if (options.debugBounds) {
    return "The Vello comparison does not render 2d-lab debug bounds.";
  }

  const background = parseHexColor(displayList.background);
  if (!background) {
    return "The Vello comparison currently requires a hex background.";
  }
  if (background[3] !== 1) {
    return "The Vello comparison currently requires an opaque background.";
  }

  for (const [index, command] of displayList.commands.entries()) {
    if (command.paint.fill && !parsePaintColor(command.paint.fill)) {
      return `Vello command ${index} uses an unsupported fill color.`;
    }
    if (command.paint.stroke && !parsePaintColor(command.paint.stroke)) {
      return `Vello command ${index} uses an unsupported stroke color.`;
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
  const { verbs, verbSpans } = packPathVerbs(displayList);
  const count = displayList.commands.length;
  const fillColors = new Float32Array(count * 4);
  const strokeColors = new Float32Array(count * 4);
  const strokeWidths = new Float32Array(count);
  const flags = new Uint32Array(count);

  for (const [index, command] of displayList.commands.entries()) {
    let commandFlags = command.closed ? FLAG_CLOSED : 0;

    if (command.paint.fill) {
      const color = parsePaintColor(command.paint.fill);
      if (!color) {
        throw new Error(`command ${index} fill could not be encoded`);
      }
      fillColors.set(color, index * 4);
      commandFlags |= FLAG_FILL;
    }

    if (command.paint.stroke) {
      const color = parsePaintColor(command.paint.stroke);
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
    verbs,
    verbSpans,
    fillColors,
    strokeColors,
    strokeWidths,
    flags,
    background: new Float32Array(background),
  };
}

function packPathVerbs(displayList: DisplayList): {
  readonly verbs: Uint32Array;
  readonly verbSpans: Uint32Array;
} {
  const verbCount = displayList.commands.reduce(
    (total, command) =>
      total +
      (command.segments?.length ?? command.points.length / 2 - 1),
    0,
  );
  const verbs = new Uint32Array(verbCount);
  const verbSpans = new Uint32Array(displayList.commands.length * 2);
  let verbOffset = 0;

  for (const [commandIndex, command] of displayList.commands.entries()) {
    const commandVerbCount =
      command.segments?.length ?? command.points.length / 2 - 1;
    verbSpans[commandIndex * 2] = verbOffset;
    verbSpans[commandIndex * 2 + 1] = commandVerbCount;

    if (command.segments) {
      for (const segment of command.segments) {
        verbs[verbOffset] =
          segment.kind === "cubic" ? VERB_CUBIC : VERB_LINE;
        verbOffset += 1;
      }
    } else {
      verbs.fill(VERB_LINE, verbOffset, verbOffset + commandVerbCount);
      verbOffset += commandVerbCount;
    }
  }

  return { verbs, verbSpans };
}
