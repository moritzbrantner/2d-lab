import type {
  Affine2D,
  DisplayList,
  Paint,
  PathCommand,
  PathSegment,
} from "../core/display-list";
import type { BenchmarkWorkload } from "../scenes/types";

const at = (x: number, y: number, scale = 1): Affine2D => [scale, 0, 0, scale, x, y];

function path(
  points: readonly number[],
  paint: Paint,
  transform: Affine2D,
  closed = true,
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

const line: PathSegment = { kind: "line" };

/** Circle of radius `r` from four cubics (the usual 0.5523 handle length). */
function circle(r: number): {
  readonly points: number[];
  readonly segments: PathSegment[];
} {
  const k = 0.5523 * r;
  return {
    points: [r, 0, 0, r, -r, 0, 0, -r],
    segments: [
      cubic([r, k], [k, r]),
      cubic([-k, r], [-r, k]),
      cubic([-r, -k], [-k, -r]),
      cubic([k, -r], [r, -k]),
    ],
  };
}

const star = [50, 0, 79, 90, 2, 34, 98, 34, 21, 90];

/**
 * Oracle-only fixture for general paths beyond the lab workloads: concave straight polygons, a
 * self-crossing star under both Canvas fill rules, concave and translucent cubic fills, a rotated
 * non-uniformly scaled curve, small circles, and stroked open and closed curves.
 */
function createPaths(): DisplayList {
  const ring = circle(36);
  const dot = circle(3.5);
  const commands: PathCommand[] = [
    // Concave arrow (straight edges, nonzero).
    path([0, 30, 60, 30, 60, 0, 110, 50, 60, 100, 60, 70, 0, 70], { fill: "#2563eb" }, at(20, 20)),
    // Self-crossing star: nonzero fills the centre, even-odd leaves it empty.
    path(star, { fill: "rgba(190, 18, 60, 0.75)" }, at(160, 20)),
    path(star, { fill: "rgba(190, 18, 60, 0.75)", fillRule: "evenodd" }, at(280, 20)),
    // Concave cubic heart.
    path(
      [50, 28, 50, 100],
      { fill: "#dc2626" },
      at(400, 15),
      true,
      [cubic([75, -10], [115, 45]), cubic([-15, 45], [25, -10])],
    ),
    // Translucent curved blob over the arrow's neighbour, crossing the star.
    path(
      [0, 40, 120, 40],
      { fill: "rgba(13, 148, 136, 0.55)" },
      at(130, 60),
      true,
      [cubic([30, -40], [90, 80]), cubic([90, 0], [30, 120])],
    ),
    // Rotated, non-uniformly scaled circle.
    path(ring.points, { fill: "#7c3aed" }, [1.4, 0.5, -0.25, 0.7, 590, 70], true, ring.segments),
    // Small circles.
    ...[0, 1, 2, 3, 4, 5].map((i) =>
      path(dot.points, { fill: "#111827" }, at(30 + i * 13.3, 160 + i * 0.37), true, dot.segments),
    ),
    // Open S-curve, round caps.
    path(
      [0, 60, 200, 20],
      { stroke: "#0f766e", strokeWidth: 6, lineCap: "round" },
      at(140, 150),
      false,
      [cubic([60, -40], [120, 120])],
    ),
    // Filled and translucently stroked closed curve.
    path(
      ring.points,
      { fill: "#fde68a", stroke: "rgba(30, 41, 59, 0.7)", strokeWidth: 5 },
      at(440, 190),
      true,
      ring.segments,
    ),
    // Curved stroke with a straight segment and a miter join.
    path(
      [0, 0, 90, 0, 90, 70],
      { stroke: "#1d4ed8", strokeWidth: 4 },
      at(560, 170),
      false,
      [cubic([30, -30], [60, 30]), line],
    ),
    // Sharp bevelled turn (9.4°, miter ratio 12.3 > 10).
    path([0, 0, 110, 9, 0, 18], { stroke: "#25283a", strokeWidth: 5 }, at(20, 200), false),
  ];

  return {
    width: 720,
    height: 260,
    background: "#f7f7fb",
    commands,
  };
}

export const pathsWorkload: BenchmarkWorkload = {
  id: "oracle-paths",
  name: "Oracle · general paths",
  description:
    "Concave and self-crossing fills under both fill rules, cubic fills and strokes, transformed and small curves.",
  create: createPaths,
};
