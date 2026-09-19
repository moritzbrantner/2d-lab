import { describe, expect, it } from "vitest";

import {
  countPoints,
  type DisplayList,
  IDENTITY_TRANSFORM,
  validateDisplayList,
} from "./display-list";

describe("display list", () => {
  it("counts point pairs", () => {
    const scene: DisplayList = {
      width: 100,
      height: 100,
      background: "#fff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 1, 0, 1, 1]),
          closed: true,
          transform: IDENTITY_TRANSFORM,
          paint: { fill: "#000" },
        },
      ],
    };

    expect(countPoints(scene)).toBe(3);
    expect(() => validateDisplayList(scene)).not.toThrow();
  });

  it("rejects partial point pairs", () => {
    const scene = {
      width: 100,
      height: 100,
      background: "#fff",
      commands: [
        {
          kind: "path" as const,
          points: new Float32Array([0, 0, 1]),
          closed: false,
          transform: IDENTITY_TRANSFORM,
          paint: { stroke: "#000" },
        },
      ],
    };

    expect(() => validateDisplayList(scene)).toThrow(/complete x\/y points/);
  });
});
