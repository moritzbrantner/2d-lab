import type { DisplayList } from "../core/display-list";

export interface FlattenedGeometry {
  readonly points: Float32Array;
  readonly spans: Uint32Array;
  readonly transforms: Float32Array;
}

export function flattenGeometry(displayList: DisplayList): FlattenedGeometry {
  const pointFloatCount = displayList.commands.reduce(
    (total, command) => total + command.points.length,
    0,
  );

  const points = new Float32Array(pointFloatCount);
  const spans = new Uint32Array(displayList.commands.length * 2);
  const transforms = new Float32Array(displayList.commands.length * 6);

  let pointOffset = 0;
  for (const [commandIndex, command] of displayList.commands.entries()) {
    points.set(command.points, pointOffset);

    spans[commandIndex * 2] = pointOffset;
    spans[commandIndex * 2 + 1] = command.points.length;
    transforms.set(command.transform, commandIndex * 6);

    pointOffset += command.points.length;
  }

  return { points, spans, transforms };
}
