import { describe, expect, it } from "vitest";

import {
  countPoints,
  type DisplayList,
  IDENTITY_TRANSFORM,
  validateDisplayList,
} from "./display-list";

describe("display list", () => {
  it("counts point pairs for straight paths", () => {
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

  it("counts cubic controls and validates explicit path segments", () => {
    const scene: DisplayList = {
      width: 100,
      height: 100,
      background: "#fff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 10, 10, 20, 10]),
          segments: [
            {
              kind: "cubic",
              control1: [3, 0],
              control2: [7, 10],
            },
            { kind: "line" },
          ],
          closed: false,
          transform: IDENTITY_TRANSFORM,
          paint: { fill: "#000" },
        },
      ],
    };

    expect(countPoints(scene)).toBe(5);
    expect(() => validateDisplayList(scene)).not.toThrow();
  });

  it("rejects blank retained geometry revisions", () => {
    const scene: DisplayList = {
      width: 100,
      height: 100,
      background: "#fff",
      retainedGeometryRevision: "   ",
      commands: [],
    };

    expect(() => validateDisplayList(scene)).toThrow(/revision/);
  });

  it("rejects partial point pairs and mismatched segment topology", () => {
    const partial = {
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

    expect(() => validateDisplayList(partial)).toThrow(/complete x\/y points/);

    const mismatched: DisplayList = {
      width: 100,
      height: 100,
      background: "#fff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 10, 10, 20, 10]),
          segments: [{ kind: "line" }],
          closed: false,
          transform: IDENTITY_TRANSFORM,
          paint: { stroke: "#000" },
        },
      ],
    };

    expect(() => validateDisplayList(mismatched)).toThrow(/path segments/);
  });
});
