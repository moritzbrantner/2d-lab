import { describe, expect, it } from "vitest";

import { transformBatches } from "./transform";

describe("transformBatches", () => {
  it("matches Canvas affine matrix semantics", () => {
    const actual = transformBatches({
      points: new Float32Array([0, 0, 2, 0, 1, 1, 3, 2]),
      spans: new Uint32Array([0, 4, 4, 4]),
      transforms: new Float32Array([
        1, 0, 0, 1, 10, 20,
        2, 0, 0, 3, -1, 4,
      ]),
    });

    expect(Array.from(actual)).toEqual([
      10, 20, 12, 20, 1, 7, 5, 10,
    ]);
  });
});
