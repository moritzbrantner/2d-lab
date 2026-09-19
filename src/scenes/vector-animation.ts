import type {
  Affine2D,
  DisplayList,
  PathCommand,
} from "../core/display-list";
import type { BenchmarkWorkload } from "./types";

const RECT = new Float32Array([-8, -22, 8, -22, 8, 22, -8, 22]);
const HEAD = new Float32Array([
  -13, -13, 13, -13, 16, 0, 11, 15, -11, 15, -16, 0,
]);
const BODY = new Float32Array([-18, -28, 18, -28, 24, 27, -24, 27]);

function transform(
  x: number,
  y: number,
  angle: number,
  scaleX = 1,
  scaleY = scaleX,
): Affine2D {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    x,
    y,
  ];
}

function command(
  points: Float32Array,
  transformValue: Affine2D,
  fill: string,
): PathCommand {
  return {
    kind: "path",
    points,
    closed: true,
    transform: transformValue,
    paint: { fill, stroke: "#25283a", strokeWidth: 1.2 },
  };
}

function createFigure(
  originX: number,
  originY: number,
  phase: number,
): PathCommand[] {
  const sway = Math.sin(phase) * 0.13;
  const arm = Math.sin(phase * 1.7) * 0.7;
  const leg = Math.sin(phase * 1.2) * 0.38;

  return [
    command(BODY, transform(originX, originY, sway), "#6f78c8"),
    command(HEAD, transform(originX, originY - 48, -sway * 0.4), "#f2c8a2"),
    command(
      RECT,
      transform(originX - 27, originY - 5, -0.45 + arm, 0.7, 1),
      "#f2c8a2",
    ),
    command(
      RECT,
      transform(originX + 27, originY - 5, 0.45 - arm, 0.7, 1),
      "#f2c8a2",
    ),
    command(
      RECT,
      transform(originX - 11, originY + 48, -0.08 + leg, 0.82, 1.15),
      "#39436f",
    ),
    command(
      RECT,
      transform(originX + 11, originY + 48, 0.08 - leg, 0.82, 1.15),
      "#39436f",
    ),
  ];
}

function createVectorAnimationScene(timeSeconds: number): DisplayList {
  const commands: PathCommand[] = [];
  const columns = 9;
  const rows = 5;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      commands.push(
        ...createFigure(
          90 + column * 128,
          100 + row * 128,
          timeSeconds * 2.1 + index * 0.21,
        ),
      );
    }
  }

  return {
    width: 1200,
    height: 720,
    background: "#f7f7fb",
    commands,
  };
}

export const vectorAnimationScene: BenchmarkWorkload = {
  id: "vector-animation",
  name: "Flat Stories · vector animation",
  description:
    "Forty-five animated vector figures with independently changing affine transforms, fills and strokes. This is the Flat Stories-shaped redraw workload: general vector semantics matter more than map-specific retained geometry.",
  create: createVectorAnimationScene,
};
