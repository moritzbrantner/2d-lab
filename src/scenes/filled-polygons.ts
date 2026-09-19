import type {
  Affine2D,
  DisplayList,
  PathCommand,
} from "../core/display-list";
import type { SceneFixture } from "./types";

const QUAD = new Float32Array([
  -17, -13,
  17, -13,
  17, 13,
  -17, 13,
]);

const PALETTE = [
  "#566a8f",
  "#7b8fb3",
  "#b28b67",
  "#82966f",
  "#9a718b",
  "#6d8f8b",
] as const;

function transform(
  x: number,
  y: number,
  angle: number,
  scale: number,
): Affine2D {
  const cosine = Math.cos(angle) * scale;
  const sine = Math.sin(angle) * scale;
  return [cosine, sine, -sine, cosine, x, y];
}

function createFilledPolygonScene(timeSeconds: number): DisplayList {
  const commands: PathCommand[] = [];
  const columns = 28;
  const rows = 18;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const phase = index * 0.071 + timeSeconds * 0.72;
      const angle = Math.sin(phase) * 0.18;
      const scale = 0.88 + Math.sin(phase * 1.7) * 0.08;

      commands.push({
        kind: "path",
        points: QUAD,
        closed: true,
        transform: transform(
          27 + column * 42,
          25 + row * 38,
          angle,
          scale,
        ),
        paint: {
          fill: PALETTE[(row * 5 + column * 3) % PALETTE.length],
        },
      });
    }
  }

  return {
    width: 1200,
    height: 720,
    background: "#f2efe8",
    commands,
  };
}

export const filledPolygonScene: SceneFixture = {
  id: "filled-polygons",
  name: "Filled polygon parity",
  description:
    "504 independently transformed convex quads with fill-only paint. Canvas and WebGPU consume the same display list; Rust triangle-fans the polygons and submits them in one GPU draw call.",
  create: createFilledPolygonScene,
};
