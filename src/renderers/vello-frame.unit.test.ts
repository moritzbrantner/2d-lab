import { describe, expect, it } from "vitest";

import type { DisplayList } from "../core/display-list";
import { packVelloFrame, velloSupportError } from "./vello-frame";

describe("Vello frame adapter", () => {
  it("preserves fill, stroke, closure and affine data", () => {
    const displayList: DisplayList = {
      width: 100,
      height: 80,
      background: "#ffffff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 20, 0, 10, 15]),
          closed: true,
          transform: [1, 0.2, -0.1, 1, 4, 7],
          paint: {
            fill: "#336699",
            stroke: "#11223380",
            strokeWidth: 2.5,
          },
        },
      ],
    };

    expect(velloSupportError(displayList, { debugBounds: false })).toBeNull();

    const packed = packVelloFrame(displayList);
    expect(Array.from(packed.spans)).toEqual([0, 6]);
    expect(Array.from(packed.verbs)).toEqual([0, 0]);
    expect(Array.from(packed.verbSpans)).toEqual([0, 2]);
    expect(packed.transforms[0]).toBe(1);
    expect(packed.transforms[1]).toBeCloseTo(0.2);
    expect(packed.transforms[2]).toBeCloseTo(-0.1);
    expect(packed.transforms[3]).toBe(1);
    expect(packed.transforms[4]).toBe(4);
    expect(packed.transforms[5]).toBe(7);
    expect(Array.from(packed.flags)).toEqual([7]);
    expect(packed.strokeWidths[0]).toBe(2.5);
    expect(packed.fillColors[3]).toBe(1);
    expect(packed.strokeColors[3]).toBeCloseTo(0x80 / 255);
  });

  it("packs cubic controls and verbs without flattening the curve", () => {
    const displayList: DisplayList = {
      width: 100,
      height: 80,
      background: "#ffffff",
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
          transform: [1, 0, 0, 1, 0, 0],
          paint: { fill: "#336699" },
        },
      ],
    };

    const packed = packVelloFrame(displayList);
    expect(Array.from(packed.points)).toEqual([
      0, 0, 3, 0, 7, 10, 10, 10, 20, 10,
    ]);
    expect(Array.from(packed.spans)).toEqual([0, 10]);
    expect(Array.from(packed.verbs)).toEqual([1, 0]);
    expect(Array.from(packed.verbSpans)).toEqual([0, 2]);
  });

  it("preserves rgba paint from product-shaped fixtures", () => {
    const displayList: DisplayList = {
      width: 100,
      height: 80,
      background: "#ffffff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 20, 0, 10, 15]),
          closed: true,
          transform: [1, 0, 0, 1, 0, 0],
          paint: {
            fill: "rgba(74, 222, 128, 0.72)",
            stroke: "rgba(236, 254, 255, 0.7)",
            strokeWidth: 1.2,
          },
        },
      ],
    };

    expect(velloSupportError(displayList, { debugBounds: false })).toBeNull();

    const packed = packVelloFrame(displayList);
    expect(packed.fillColors[0]).toBeCloseTo(74 / 255);
    expect(packed.fillColors[1]).toBeCloseTo(222 / 255);
    expect(packed.fillColors[2]).toBeCloseTo(128 / 255);
    expect(packed.fillColors[3]).toBeCloseTo(0.72);
    expect(packed.strokeColors[3]).toBeCloseTo(0.7);
  });

  it("fails closed for unsupported paint syntax", () => {
    const displayList: DisplayList = {
      width: 100,
      height: 80,
      background: "#ffffff",
      commands: [
        {
          kind: "path",
          points: new Float32Array([0, 0, 20, 0]),
          closed: false,
          transform: [1, 0, 0, 1, 0, 0],
          paint: { stroke: "rgb(0 0 0)" },
        },
      ],
    };

    expect(velloSupportError(displayList, { debugBounds: false })).toMatch(
      /unsupported stroke color/,
    );
  });
});
