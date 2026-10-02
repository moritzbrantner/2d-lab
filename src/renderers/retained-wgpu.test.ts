import { describe, expect, it } from "vitest";

import type { DisplayList } from "../core/display-list";
import {
  createRetainedGeometryChunkSnapshot,
  createRetainedGeometrySnapshot,
  retainedGeometryChunkMatchesSnapshot,
  retainedGeometryChunkPlan,
  retainedGeometryChunkVisibility,
  retainedGeometryMatchesSnapshot,
  retainedRendererSupportError,
} from "./retained-wgpu";

function scene(
  secondTransform = false,
  retainedGeometryRevision?: string,
): DisplayList {
  return {
    width: 100,
    height: 100,
    background: "#ffffff",
    ...(retainedGeometryRevision === undefined
      ? {}
      : { retainedGeometryRevision }),
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

  it("uses an authoritative revision as the retained-geometry fast path", () => {
    const snapshot = createRetainedGeometrySnapshot(
      scene(false, "geometry:1"),
      12,
    );

    expect(
      retainedGeometryMatchesSnapshot(snapshot, scene(false, "geometry:1")),
    ).toBe(true);
    expect(
      retainedGeometryMatchesSnapshot(snapshot, scene(false, "geometry:2")),
    ).toBe(false);
    expect(retainedGeometryMatchesSnapshot(snapshot, scene())).toBe(false);
  });

  it("keeps value verification as the safe fallback without a revision", () => {
    const snapshot = createRetainedGeometrySnapshot(scene(), 12);
    const changed = scene();
    changed.commands[0]!.points[0] = 1;

    expect(retainedGeometryMatchesSnapshot(snapshot, scene())).toBe(true);
    expect(retainedGeometryMatchesSnapshot(snapshot, changed)).toBe(false);
  });

  it("changes chunk visibility without invalidating retained geometry", () => {
    const first: DisplayList = {
      ...scene(),
      retainedGeometryChunks: [
        { commandStart: 0, commandCount: 1, revision: "left:1" },
        { commandStart: 1, commandCount: 1, revision: "right:1" },
      ],
    };
    const second: DisplayList = {
      ...scene(),
      retainedGeometryChunks: [
        {
          commandStart: 0,
          commandCount: 1,
          revision: "left:1",
          visible: false,
        },
        { commandStart: 1, commandCount: 1, revision: "right:1" },
      ],
    };
    const firstPlans = retainedGeometryChunkPlan(first);
    const snapshot = createRetainedGeometryChunkSnapshot(
      first,
      firstPlans[0]!,
      6,
    );
    const secondPlans = retainedGeometryChunkPlan(second);

    expect(
      retainedGeometryChunkMatchesSnapshot(
        snapshot,
        second,
        secondPlans[0]!,
      ),
    ).toBe(true);
    expect(Array.from(retainedGeometryChunkVisibility(secondPlans))).toEqual([
      0,
      1,
    ]);
  });

  it("invalidates only the retained chunk whose producer revision changed", () => {
    const first: DisplayList = {
      ...scene(),
      retainedGeometryChunks: [
        { commandStart: 0, commandCount: 1, revision: "left:1" },
        { commandStart: 1, commandCount: 1, revision: "right:1" },
      ],
    };
    const second: DisplayList = {
      ...scene(),
      retainedGeometryChunks: [
        { commandStart: 0, commandCount: 1, revision: "left:1" },
        { commandStart: 1, commandCount: 1, revision: "right:2" },
      ],
    };
    const firstPlans = retainedGeometryChunkPlan(first);
    const snapshots = firstPlans.map((plan) =>
      createRetainedGeometryChunkSnapshot(first, plan, 6),
    );
    const secondPlans = retainedGeometryChunkPlan(second);

    expect(
      retainedGeometryChunkMatchesSnapshot(
        snapshots[0],
        second,
        secondPlans[0]!,
      ),
    ).toBe(true);
    expect(
      retainedGeometryChunkMatchesSnapshot(
        snapshots[1],
        second,
        secondPlans[1]!,
      ),
    ).toBe(false);
  });
});
