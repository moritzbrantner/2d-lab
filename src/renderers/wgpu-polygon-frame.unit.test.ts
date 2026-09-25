import { describe, expect, it } from "vitest";

import type { DisplayList } from "../core/display-list";
import {
  packPolygonFrame,
  polygonRendererSupportError,
} from "./wgpu-polygon-frame";

const convexScene: DisplayList = {
  width: 100,
  height: 100,
  background: "#ffffff",
  commands: [
    {
      kind: "path",
      points: new Float32Array([0, 0, 20, 0, 20, 20, 0, 20]),
      closed: true,
      transform: [1, 0, 0, 1, 10, 15],
      paint: { fill: "#336699" },
    },
  ],
};

describe("wgpu polygon frame", () => {
  it("packs the same display-list geometry with RGBA colors", () => {
    expect(
      polygonRendererSupportError(convexScene, { debugBounds: false }),
    ).toBeNull();

    const packed = packPolygonFrame(convexScene);
    expect(Array.from(packed.spans)).toEqual([0, 8]);
    expect(Array.from(packed.transforms)).toEqual([1, 0, 0, 1, 10, 15]);
    expect(packed.colors[0]).toBeCloseTo(0x33 / 255);
    expect(packed.colors[1]).toBeCloseTo(0x66 / 255);
    expect(packed.colors[2]).toBeCloseTo(0x99 / 255);
    expect(packed.colors[3]).toBe(1);
  });

  it("fails closed for curved path semantics", () => {
    const curved: DisplayList = {
      ...convexScene,
      commands: [
        {
          ...convexScene.commands[0]!,
          segments: [
            {
              kind: "cubic",
              control1: [5, -5],
              control2: [15, -5],
            },
            { kind: "line" },
            { kind: "line" },
            { kind: "line" },
          ],
        },
      ],
    };

    expect(
      polygonRendererSupportError(curved, { debugBounds: false }),
    ).toMatch(/straight edges only/);
  });

  it("fails closed for unsupported paint and geometry semantics", () => {
    const translucentBackground: DisplayList = {
      ...convexScene,
      background: "#ffffff80",
    };
    expect(
      polygonRendererSupportError(translucentBackground, {
        debugBounds: false,
      }),
    ).toMatch(/opaque background/);

    const stroked: DisplayList = {
      ...convexScene,
      commands: [
        {
          ...convexScene.commands[0]!,
          paint: { fill: "#fff", stroke: "#000" },
        },
      ],
    };
    expect(
      polygonRendererSupportError(stroked, { debugBounds: false }),
    ).toMatch(/stroke/);

    const concave: DisplayList = {
      ...convexScene,
      commands: [
        {
          ...convexScene.commands[0]!,
          points: new Float32Array([
            0, 0, 20, 0, 10, 8, 20, 20, 0, 20,
          ]),
        },
      ],
    };
    expect(
      polygonRendererSupportError(concave, { debugBounds: false }),
    ).toMatch(/concave|degenerate/);
  });
});
