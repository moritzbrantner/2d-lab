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
    expect(packed.fillColors[0]).toBeCloseTo(0x33 / 255);
    expect(packed.fillColors[1]).toBeCloseTo(0x66 / 255);
    expect(packed.fillColors[2]).toBeCloseTo(0x99 / 255);
    expect(packed.fillColors[3]).toBe(1);
    expect(Array.from(packed.verbs)).toEqual([0, 0, 0]);
  });

  it("packs Canvas stroke styles with Canvas defaults", () => {
    const stroked: DisplayList = {
      ...convexScene,
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 20, 0, 20, 20]),
          closed: false,
          transform: [1, 0, 0, 1, 0, 0],
          paint: { stroke: "rgba(10, 20, 30, 0.5)", strokeWidth: 3 },
        },
        {
          kind: "path",
          points: new Float32Array([0, 0, 20, 0, 20, 20]),
          closed: false,
          transform: [1, 0, 0, 1, 0, 0],
          paint: {
            stroke: "#000",
            lineCap: "square",
            lineJoin: "round",
            miterLimit: 4,
          },
        },
      ],
    };
    expect(
      polygonRendererSupportError(stroked, { debugBounds: false }),
    ).toBeNull();

    const packed = packPolygonFrame(stroked);
    // Stroke flag; butt cap (0 << 3) and miter join (0 << 5) by default.
    expect(packed.flags[0]).toBe(4);
    expect(packed.flags[1]).toBe(4 | (2 << 3) | (1 << 5));
    expect(Array.from(packed.strokeWidths)).toEqual([3, 1]);
    expect(Array.from(packed.miterLimits)).toEqual([10, 4]);
    expect(packed.strokeColors[3]).toBe(0.5);
  });

  it("packs curved, concave and even-odd paths with their verbs", () => {
    const paths: DisplayList = {
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
        {
          ...convexScene.commands[0]!,
          points: new Float32Array([0, 0, 20, 0, 10, 8, 20, 20, 0, 20]),
          paint: { fill: "#336699", fillRule: "evenodd" },
        },
      ],
    };
    expect(
      polygonRendererSupportError(paths, { debugBounds: false }),
    ).toBeNull();

    const packed = packPolygonFrame(paths);
    // Cubic (1) then three lines (0), then the concave polygon's four lines.
    expect(Array.from(packed.verbs)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(packed.verbSpans)).toEqual([0, 4, 4, 4]);
    // Closed (1) | fill (2), plus even-odd (1 << 7) on the second.
    expect(Array.from(packed.flags)).toEqual([3, 3 | (1 << 7)]);
  });

  it("fails closed for unsupported paint semantics", () => {
    const translucentBackground: DisplayList = {
      ...convexScene,
      background: "#ffffff80",
    };
    expect(
      polygonRendererSupportError(translucentBackground, {
        debugBounds: false,
      }),
    ).toMatch(/opaque background/);
  });
});
