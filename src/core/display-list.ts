export type Affine2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

export type Paint = {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
};

export type LinePathSegment = {
  readonly kind: "line";
};

export type CubicPathSegment = {
  readonly kind: "cubic";
  readonly control1: readonly [x: number, y: number];
  readonly control2: readonly [x: number, y: number];
};

export type PathSegment = LinePathSegment | CubicPathSegment;

export type PathCommand = {
  readonly kind: "path";
  readonly points: Float32Array;
  readonly segments?: readonly PathSegment[];
  readonly closed: boolean;
  readonly transform: Affine2D;
  readonly paint: Paint;
};

export type DisplayList = {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly commands: readonly PathCommand[];
};

export const IDENTITY_TRANSFORM: Affine2D = [1, 0, 0, 1, 0, 0];

export function countPoints(displayList: DisplayList): number {
  return displayList.commands.reduce(
    (total, command) => total + commandEncodedPointCount(command),
    0,
  );
}

function commandEncodedPointCount(command: PathCommand): number {
  if (!command.segments) {
    return command.points.length / 2;
  }

  return (
    1 +
    command.segments.reduce(
      (total, segment) => total + (segment.kind === "cubic" ? 3 : 1),
      0,
    )
  );
}

export function validateDisplayList(displayList: DisplayList): void {
  if (
    !Number.isFinite(displayList.width) ||
    !Number.isFinite(displayList.height) ||
    displayList.width <= 0 ||
    displayList.height <= 0
  ) {
    throw new Error("display-list dimensions must be positive and finite");
  }

  for (const [index, command] of displayList.commands.entries()) {
    if (command.points.length < 4 || command.points.length % 2 !== 0) {
      throw new Error(
        `command ${index} must contain at least two complete x/y points`,
      );
    }
    if (command.points.some((value) => !Number.isFinite(value))) {
      throw new Error(`command ${index} contains a non-finite point`);
    }
    if (command.transform.some((value) => !Number.isFinite(value))) {
      throw new Error(`command ${index} contains a non-finite transform`);
    }

    if (command.segments) {
      const pointCount = command.points.length / 2;
      const expectedSegmentCount = command.closed ? pointCount : pointCount - 1;
      if (command.segments.length !== expectedSegmentCount) {
        throw new Error(
          `command ${index} has ${command.segments.length} path segments; expected ${expectedSegmentCount}`,
        );
      }
      for (const [segmentIndex, segment] of command.segments.entries()) {
        if (
          segment.kind === "cubic" &&
          [...segment.control1, ...segment.control2].some(
            (value) => !Number.isFinite(value),
          )
        ) {
          throw new Error(
            `command ${index} segment ${segmentIndex} has a non-finite control point`,
          );
        }
      }
    }

    if (!command.paint.fill && !command.paint.stroke) {
      throw new Error(`command ${index} must have a fill or stroke`);
    }
    if (
      command.paint.strokeWidth !== undefined &&
      (!Number.isFinite(command.paint.strokeWidth) ||
        command.paint.strokeWidth <= 0)
    ) {
      throw new Error(`command ${index} has a non-positive stroke width`);
    }
  }
}
