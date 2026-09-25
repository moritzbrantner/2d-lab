import type { Affine2D } from "../core/display-list";

export interface RetainedMapFeature {
  readonly row: number;
  readonly column: number;
  readonly points: Float32Array;
  readonly alternatePoints: Float32Array;
  readonly fill: string;
}

export const RETAINED_MAP_COLUMNS = 32;
export const RETAINED_MAP_ROWS = 20;

const PALETTE = [
  "#d8dfca",
  "#e7deca",
  "#d6e0df",
  "#e5d6cf",
  "#ded8e8",
] as const;

export const RETAINED_MAP_FEATURES: readonly RetainedMapFeature[] = Array.from(
  { length: RETAINED_MAP_COLUMNS * RETAINED_MAP_ROWS },
  (_, index) => {
    const column = index % RETAINED_MAP_COLUMNS;
    const row = Math.floor(index / RETAINED_MAP_COLUMNS);
    const x = column * 39;
    const y = row * 36;
    const inset = ((row * 11 + column * 17) % 6) * 0.55;
    const points = new Float32Array([
      x + inset,
      y + inset,
      x + 31 - inset,
      y + 1,
      x + 34,
      y + 27 - inset,
      x + 3,
      y + 29,
    ]);
    const centerX = x + 17;
    const centerY = y + 15;
    const alternatePoints = points.slice();
    for (
      let pointIndex = 0;
      pointIndex < alternatePoints.length;
      pointIndex += 2
    ) {
      const pointX = alternatePoints[pointIndex]!;
      const pointY = alternatePoints[pointIndex + 1]!;
      alternatePoints[pointIndex] = pointX + (centerX - pointX) * 0.04;
      alternatePoints[pointIndex + 1] =
        pointY + (centerY - pointY) * 0.04;
    }

    return {
      row,
      column,
      points,
      alternatePoints,
      fill: PALETTE[(row * 3 + column * 7) % PALETTE.length]!,
    };
  },
);

export function retainedMapTransform(timeSeconds: number): Affine2D {
  const zoom = 0.96 + Math.sin(timeSeconds * 0.31) * 0.035;
  const panX = -35 + Math.sin(timeSeconds * 0.52) * 28;
  const panY = -10 + Math.cos(timeSeconds * 0.44) * 18;
  return [zoom, 0, 0, zoom, panX, panY];
}
