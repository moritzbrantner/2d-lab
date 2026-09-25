import type {
  Affine2D,
  Paint,
  PathCommand,
  PathSegment,
} from "../core/display-list";
import type { BenchmarkWorkload } from "./types";

const COLUMNS = 6;
const ROWS = 6;
const CELL_WIDTH = 180;
const CELL_HEIGHT = 160;

type CurveShape = {
  readonly points: readonly number[];
  readonly segments: readonly PathSegment[];
  readonly paint: Paint;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
};

const torso: CurveShape = {
  points: [-8, -48, 108, -42, 112, 42, -8, 46],
  segments: [
    {
      kind: "cubic",
      control1: [30, -68],
      control2: [72, -66],
    },
    { kind: "line" },
    {
      kind: "cubic",
      control1: [70, 66],
      control2: [30, 68],
    },
    { kind: "line" },
  ],
  paint: { fill: "#5b7cfa" },
  scale: 0.55,
  offsetX: 42,
  offsetY: 82,
};

const hair: CurveShape = {
  points: [-46, -12, 8, -54, 50, -10, 18, -30, -12, -20],
  segments: [
    {
      kind: "cubic",
      control1: [-42, -52],
      control2: [-20, -66],
    },
    {
      kind: "cubic",
      control1: [34, -52],
      control2: [48, -40],
    },
    { kind: "line" },
    { kind: "line" },
    { kind: "line" },
  ],
  paint: { fill: "#283241" },
  scale: 0.6,
  offsetX: 126,
  offsetY: 70,
};

const shapes: readonly CurveShape[] = [torso, hair];

function transformFor(
  column: number,
  row: number,
  shape: CurveShape,
): Affine2D {
  return [
    shape.scale,
    0,
    0,
    shape.scale,
    column * CELL_WIDTH + shape.offsetX,
    row * CELL_HEIGHT + shape.offsetY,
  ];
}

function commandFor(
  column: number,
  row: number,
  shape: CurveShape,
): PathCommand {
  return {
    kind: "path",
    points: new Float32Array(shape.points),
    segments: shape.segments,
    closed: true,
    transform: transformFor(column, row, shape),
    paint: shape.paint,
  };
}

function createCurveCommands(): readonly PathCommand[] {
  const commands: PathCommand[] = [];
  for (let index = 0; index < COLUMNS * ROWS; index += 1) {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    for (const shape of shapes) {
      commands.push(commandFor(column, row, shape));
    }
  }
  return commands;
}

const commands = createCurveCommands();

export const flatStoriesCurveScene: BenchmarkWorkload = {
  id: "flat-stories-curves",
  name: "Flat Stories · Nova curve slice",
  description:
    "Exact cubic path anchors and handles from Nova's torso and hair, repeated over Flat Stories' 36-copy benchmark grid with lab-owned placement. Canvas and pinned Vello preserve the curves; custom polygon backends must reject them.",
  create() {
    return {
      width: COLUMNS * CELL_WIDTH,
      height: ROWS * CELL_HEIGHT,
      background: "#f7efe4",
      commands,
    };
  },
};
