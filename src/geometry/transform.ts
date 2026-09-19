import type { FlattenedGeometry } from "./flatten";

export function transformBatches(
  geometry: FlattenedGeometry,
): Float32Array {
  if (geometry.spans.length % 2 !== 0) {
    throw new Error("spans must contain start/length pairs");
  }

  const commandCount = geometry.spans.length / 2;
  if (geometry.transforms.length !== commandCount * 6) {
    throw new Error("each command must provide one affine transform");
  }

  const output = geometry.points.slice();

  for (let commandIndex = 0; commandIndex < commandCount; commandIndex += 1) {
    const start = geometry.spans[commandIndex * 2] ?? 0;
    const length = geometry.spans[commandIndex * 2 + 1] ?? 0;
    if (start % 2 !== 0 || length % 2 !== 0 || start + length > output.length) {
      throw new Error("invalid point span");
    }

    const matrixOffset = commandIndex * 6;
    const a = geometry.transforms[matrixOffset] ?? 0;
    const b = geometry.transforms[matrixOffset + 1] ?? 0;
    const c = geometry.transforms[matrixOffset + 2] ?? 0;
    const d = geometry.transforms[matrixOffset + 3] ?? 0;
    const e = geometry.transforms[matrixOffset + 4] ?? 0;
    const f = geometry.transforms[matrixOffset + 5] ?? 0;

    for (let pointOffset = start; pointOffset < start + length; pointOffset += 2) {
      const x = geometry.points[pointOffset] ?? 0;
      const y = geometry.points[pointOffset + 1] ?? 0;
      output[pointOffset] = a * x + c * y + e;
      output[pointOffset + 1] = b * x + d * y + f;
    }
  }

  return output;
}
