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

    expect(
      velloSupportError(displayList, { debugBounds: false }),
    ).toBeNull();

    const packed = packVelloFrame(displayList);
    expect(Array.from(packed.spans)).toEqual([0, 6]);
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

  it("fails closed for non-hex paint in the experiment adapter", () => {
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

    expect(
      velloSupportError(displayList, { debugBounds: false }),
    ).toMatch(/non-hex stroke/);
  });
});
