import type {
  Affine2D,
  DisplayList,
  Paint,
  PathCommand,
  PathSegment,
} from "../core/display-list";
import type { BenchmarkWorkload } from "../scenes/types";

const at = (x: number, y: number): Affine2D => [1, 0, 0, 1, x, y];

function path(
  points: readonly number[],
  paint: Paint,
  transform: Affine2D,
  closed = false,
  segments?: readonly PathSegment[],
): PathCommand {
  return {
    kind: "path",
    points: new Float32Array(points),
    ...(segments ? { segments } : {}),
    closed,
    transform,
    paint,
  };
}

const cubic = (
  control1: readonly [number, number],
  control2: readonly [number, number],
): PathSegment => ({ kind: "cubic", control1, control2 });

const ink = "rgba(37, 40, 58, 0.55)";

/**
 * Oracle-only fixture for translucent strokes that overlap themselves (#61): a cubic figure-eight,
 * an open loop, a stroked pentagram, a shallow double pass, sharp hairpins under every join and a
 * transformed crossing polyline. Canvas strokes with nonzero coverage, so every overlap blends
 * once.
 */
function createStrokeCrossings(): DisplayList {
  const commands: PathCommand[] = [
    // Closed figure-eight from two cubic lobes crossing at the centre.
    path(
      [0, 50, 160, 50],
      { stroke: ink, strokeWidth: 14, lineJoin: "round" },
      at(20, 20),
      true,
      [cubic([40, -20], [120, 120]), cubic([120, -20], [40, 120])],
    ),
    // Open loop (one cubic crossing itself), round caps.
    path(
      [0, 90, 150, 90],
      { stroke: "rgba(15, 118, 110, 0.6)", strokeWidth: 10, lineCap: "round" },
      at(210, 40),
      false,
      [cubic([220, -60], [-70, -60])],
    ),
    // Stroked pentagram: five crossings, sharp mitre tips at the default limit.
    path(
      [50, 0, 79, 90, 2, 34, 98, 34, 21, 90],
      { stroke: "rgba(190, 18, 60, 0.5)", strokeWidth: 6 },
      at(400, 15),
      true,
    ),
    // Shallow crossing: two nearly parallel passes.
    path(
      [0, 0, 160, 14, 160, 0, 0, 14],
      { stroke: "rgba(29, 78, 216, 0.5)", strokeWidth: 9, lineJoin: "bevel" },
      at(530, 30),
      false,
    ),
    // Rotated, non-uniformly scaled crossing polyline with square caps.
    path(
      [0, 0, 70, 50, 70, 0, 0, 50],
      { stroke: "rgba(124, 58, 237, 0.55)", strokeWidth: 7, lineCap: "square" },
      [1.2, 0.4, -0.3, 0.8, 590, 90],
      false,
    ),
  ];

  // Sharp hairpins (≈ 6° turns, mitred up to ratio 40) under each join: the arms overlap.
  for (const [i, lineJoin] of (["miter", "round", "bevel"] as const).entries()) {
    commands.push(
      path(
        [0, 0, 120, 6, 0, 12, 120, 18, 0, 24],
        { stroke: ink, strokeWidth: 8, lineJoin, miterLimit: 40 },
        at(20 + i * 230, 190),
        false,
      ),
    );
  }

  return {
    width: 720,
    height: 240,
    background: "#f7f7fb",
    commands,
  };
}

export const strokeCrossingsWorkload: BenchmarkWorkload = {
  id: "oracle-stroke-crossings",
  name: "Oracle · self-crossing strokes",
  description:
    "Translucent strokes that cross or fold over themselves: figure-eight, loop, pentagram, hairpins.",
  create: createStrokeCrossings,
};
