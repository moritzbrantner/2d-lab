export type Affine2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

export interface Paint {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

export interface PathCommand {
  readonly kind: "path";
  readonly points: Float32Array;
  readonly closed: boolean;
  readonly transform: Affine2D;
  readonly paint: Paint;
}

export interface DisplayList {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly commands: readonly PathCommand[];
}

export const IDENTITY_TRANSFORM: Affine2D = [1, 0, 0, 1, 0, 0];

export function countPoints(displayList: DisplayList): number {
  return displayList.commands.reduce(
    (total, command) => total + command.points.length / 2,
    0,
  );
}

export function validateDisplayList(displayList: DisplayList): void {
  if (displayList.width <= 0 || displayList.height <= 0) {
    throw new Error("display-list dimensions must be positive");
  }

  for (const [index, command] of displayList.commands.entries()) {
    if (command.points.length < 4 || command.points.length % 2 !== 0) {
      throw new Error(
        `command ${index} must contain at least two complete x/y points`,
      );
    }
    if (!command.paint.fill && !command.paint.stroke) {
      throw new Error(`command ${index} must have a fill or stroke`);
    }
    if (
      command.paint.strokeWidth !== undefined &&
      command.paint.strokeWidth <= 0
    ) {
      throw new Error(`command ${index} has a non-positive stroke width`);
    }
  }
}
