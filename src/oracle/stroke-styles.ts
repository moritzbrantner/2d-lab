import type {
  Affine2D,
  DisplayList,
  LineCap,
  LineJoin,
  PathCommand,
} from "../core/display-list";
import type { BenchmarkWorkload } from "../scenes/types";

const CAPS: readonly LineCap[] = ["butt", "round", "square"];
const JOINS: readonly LineJoin[] = ["miter", "round", "bevel"];

function stroke(
  points: readonly number[],
  paint: PathCommand["paint"],
  transform: Affine2D = [1, 0, 0, 1, 0, 0],
  closed = false,
): PathCommand {
  return {
    kind: "path",
    points: new Float32Array(points),
    closed,
    transform,
    paint,
  };
}

/**
 * Oracle-only fixture for the Canvas stroke styles the lab workloads leave at their defaults:
 * every cap × join on a translucent zigzag, the miter limit (a 30° turn, miter ratio ≈ 3.9,
 * bevels at limit 3 and mitres at the default 10), a closed outline, a non-uniformly scaled
 * stroke and a hairline.
 */
function createStrokeStyles(): DisplayList {
  const commands: PathCommand[] = [];
  for (const [row, cap] of CAPS.entries()) {
    for (const [column, lineJoin] of JOINS.entries()) {
      const x = 30 + column * 190;
      const y = 30 + row * 90;
      commands.push(
        stroke([x, y + 50, x + 40, y, x + 80, y + 50, x + 130, y + 10], {
          stroke: "rgba(37, 40, 58, 0.6)",
          strokeWidth: 12,
          lineCap: cap,
          lineJoin,
        }),
      );
    }
  }

  const turn = [0, 0, 80, 21.4, 0, 42.8];
  commands.push(
    stroke(
      turn,
      { stroke: "#c2410c", strokeWidth: 6, miterLimit: 3 },
      [1, 0, 0, 1, 610, 20],
    ),
    stroke(turn, { stroke: "#c2410c", strokeWidth: 6 }, [1, 0, 0, 1, 610, 90]),
    stroke(
      [0, 0, 70, 0, 70, 50, 0, 50],
      { stroke: "rgba(22, 101, 52, 0.7)", strokeWidth: 7, lineJoin: "round" },
      [1, 0, 0, 1, 620, 170],
      true,
    ),
    // Width in user space under a rotated, non-uniform transform.
    stroke(
      [0, 0, 60, 0, 60, 30],
      { stroke: "#1d4ed8", strokeWidth: 4, lineCap: "square" },
      [1.8, 0.6, -0.3, 0.9, 610, 260],
    ),
    stroke([20, 312, 760, 296], { stroke: "#25283a", strokeWidth: 0.6 }),
  );

  return {
    width: 800,
    height: 330,
    background: "#f7f7fb",
    commands,
  };
}

export const strokeStylesWorkload: BenchmarkWorkload = {
  id: "oracle-stroke-styles",
  name: "Oracle · Canvas stroke styles",
  description:
    "Every line cap and join, the miter limit, a closed outline, a transformed stroke and a hairline.",
  create: createStrokeStyles,
};
