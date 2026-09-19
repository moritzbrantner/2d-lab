import { describe, expect, it } from "vitest";

import type { DisplayList } from "../core/display-list";
import { flattenGeometry } from "./flatten";

describe("flattenGeometry", () => {
  it("creates one contiguous ABI for all commands", () => {
    const displayList: DisplayList = {
      width: 10,
      height: 10,
      background: "#fff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 1, 1]),
          closed: false,
          transform: [1, 0, 0, 1, 2, 3],
          paint: { stroke: "#000" },
        },
        {
          kind: "path",
          points: new Float32Array([4, 5, 6, 7, 8, 9]),
          closed: true,
          transform: [2, 0, 0, 2, 0, 0],
          paint: { fill: "#000" },
        },
      ],
    };

    const flattened = flattenGeometry(displayList);

    expect(Array.from(flattened.points)).toEqual([
      0, 0, 1, 1, 4, 5, 6, 7, 8, 9,
    ]);
    expect(Array.from(flattened.spans)).toEqual([0, 4, 4, 6]);
    expect(Array.from(flattened.transforms)).toEqual([
      1, 0, 0, 1, 2, 3, 2, 0, 0, 2, 0, 0,
    ]);
  });
});
