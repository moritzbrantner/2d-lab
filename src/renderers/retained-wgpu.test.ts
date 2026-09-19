import { describe, expect, it } from "vitest";

import type { DisplayList } from "../core/display-list";
import { retainedRendererSupportError } from "./retained-wgpu";

function scene(secondTransform = false): DisplayList {
  return {
    width: 100,
    height: 100,
    background: "#ffffff",
    commands: [
      {
        kind: "path",
        points: new Float32Array([0, 0, 20, 0, 20, 20, 0, 20]),
        closed: true,
        transform: [1, 0, 0, 1, 5, 7],
        paint: { fill: "#336699" },
      },
      {
        kind: "path",
        points: new Float32Array([30, 0, 50, 0, 50, 20, 30, 20]),
        closed: true,
        transform: secondTransform
          ? [1, 0, 0, 1, 6, 7]
          : [1, 0, 0, 1, 5, 7],
        paint: { fill: "#996633" },
      },
    ],
  };
}

describe("retained WebGPU boundary", () => {
  it("accepts fill geometry sharing one frame transform", () => {
    expect(retainedRendererSupportError(scene(), false)).toBeNull();
  });

  it("rejects independent per-command transforms", () => {
    expect(retainedRendererSupportError(scene(true), false)).toMatch(
      /shared frame transform/,
    );
  });
});
