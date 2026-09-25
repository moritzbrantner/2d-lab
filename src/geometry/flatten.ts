import type { DisplayList, PathCommand } from "../core/display-list";

export type FlattenedGeometry = {
  readonly points: Float32Array;
  readonly spans: Uint32Array;
  readonly transforms: Float32Array;
};

export function pathDataFloatCount(command: PathCommand): number {
  if (!command.segments) {
    return command.points.length;
  }

  return (
    2 +
    command.segments.reduce(
      (total, segment) => total + (segment.kind === "cubic" ? 6 : 2),
      0,
    )
  );
}

export function flattenGeometry(displayList: DisplayList): FlattenedGeometry {
  const pointFloatCount = displayList.commands.reduce(
    (total, command) => total + pathDataFloatCount(command),
    0,
  );

  const points = new Float32Array(pointFloatCount);
  const spans = new Uint32Array(displayList.commands.length * 2);
  const transforms = new Float32Array(displayList.commands.length * 6);

  let pointOffset = 0;
  for (const [commandIndex, command] of displayList.commands.entries()) {
    const commandFloatCount = writePathData(command, points, pointOffset);

    spans[commandIndex * 2] = pointOffset;
    spans[commandIndex * 2 + 1] = commandFloatCount;
    transforms.set(command.transform, commandIndex * 6);

    pointOffset += commandFloatCount;
  }

  return { points, spans, transforms };
}

function writePathData(
  command: PathCommand,
  target: Float32Array,
  offset: number,
): number {
  if (!command.segments) {
    target.set(command.points, offset);
    return command.points.length;
  }

  target[offset] = command.points[0] ?? 0;
  target[offset + 1] = command.points[1] ?? 0;
  let cursor = offset + 2;
  const pointCount = command.points.length / 2;

  for (const [segmentIndex, segment] of command.segments.entries()) {
    if (segment.kind === "cubic") {
      target[cursor] = segment.control1[0];
      target[cursor + 1] = segment.control1[1];
      target[cursor + 2] = segment.control2[0];
      target[cursor + 3] = segment.control2[1];
      cursor += 4;
    }

    const targetPointIndex = (segmentIndex + 1) % pointCount;
    target[cursor] = command.points[targetPointIndex * 2] ?? 0;
    target[cursor + 1] = command.points[targetPointIndex * 2 + 1] ?? 0;
    cursor += 2;
  }

  return cursor - offset;
}
