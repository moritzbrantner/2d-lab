import { describe, expect, it } from "vitest";

import { validateDisplayList } from "./core/display-list";
import { canvas2dRenderer } from "./renderers/canvas2d";
import { resolveCustomWgpuBackend } from "./renderers/custom-wgpu";
import { velloGpuRenderer } from "./renderers/vello";
import { filledPolygonScene } from "./scenes/filled-polygons";
import { flatStoriesCurveScene } from "./scenes/flat-stories-curves";
import { mapLikeScene } from "./scenes/map-like";
import { mapsE2eStyleWorkload } from "./scenes/maps-e2e-style";
import { retainedMapScene } from "./scenes/retained-map";
import { retainedMapChurnScene } from "./scenes/retained-map-churn";
import type { BenchmarkWorkload } from "./scenes/types";
import { vectorAnimationScene } from "./scenes/vector-animation";

const workloads: readonly BenchmarkWorkload[] = [
  retainedMapScene,
  retainedMapChurnScene,
  mapsE2eStyleWorkload,
  flatStoriesCurveScene,
  vectorAnimationScene,
  filledPolygonScene,
  mapLikeScene,
];

describe("renderer benchmark contract", () => {
  it("keeps every workload deterministic at the same timestamp", () => {
    for (const workload of workloads) {
      const first = workload.create(1.25);
      const second = workload.create(1.25);

      validateDisplayList(first);
      validateDisplayList(second);

      expect(first.width, workload.id).toBe(second.width);
      expect(first.height, workload.id).toBe(second.height);
      expect(first.background, workload.id).toBe(second.background);
      expect(first.retainedGeometryRevision, workload.id).toBe(
        second.retainedGeometryRevision,
      );
      expect(first.retainedGeometryChunks, workload.id).toEqual(
        second.retainedGeometryChunks,
      );
      expect(first.commands.length, workload.id).toBe(second.commands.length);

      for (let index = 0; index < first.commands.length; index += 1) {
        const left = first.commands[index]!;
        const right = second.commands[index]!;
        expect(Array.from(left.points), `${workload.id} command ${index} points`).toEqual(
          Array.from(right.points),
        );
        expect(left.segments, `${workload.id} command ${index} segments`).toEqual(
          right.segments,
        );
        expect(left.transform, `${workload.id} command ${index} transform`).toEqual(
          right.transform,
        );
        expect(left.paint, `${workload.id} command ${index} paint`).toEqual(
          right.paint,
        );
      }
    }
  });

  it("keeps Canvas and Vello available as the common comparison baseline", () => {
    for (const workload of workloads) {
      const displayList = workload.create(0);
      const options = { debugBounds: false };

      expect(canvas2dRenderer.support(displayList, options), workload.id).toBeNull();
      expect(velloGpuRenderer.support(displayList, options), workload.id).toBeNull();
    }
  });

  it("exposes the current custom Rust/WASM + wgpu coverage explicitly", () => {
    const retained = resolveCustomWgpuBackend(retainedMapScene.create(0), {
      debugBounds: false,
    });
    expect(typeof retained).not.toBe("string");
    if (typeof retained !== "string") {
      expect(retained.id).toBe("retained");
    }

    const retainedChurn = resolveCustomWgpuBackend(
      retainedMapChurnScene.create(0),
      { debugBounds: false },
    );
    expect(typeof retainedChurn).not.toBe("string");
    if (typeof retainedChurn !== "string") {
      expect(retainedChurn.id).toBe("retained");
    }

    const immediate = resolveCustomWgpuBackend(filledPolygonScene.create(0), {
      debugBounds: false,
    });
    expect(typeof immediate).not.toBe("string");
    if (typeof immediate !== "string") {
      expect(immediate.id).toBe("immediate");
    }

    for (const workload of [
      mapsE2eStyleWorkload,
      flatStoriesCurveScene,
      vectorAnimationScene,
      mapLikeScene,
    ]) {
      expect(
        resolveCustomWgpuBackend(workload.create(0), {
          debugBounds: false,
        }),
        workload.id,
      ).toMatch(/No Rust\/WASM \+ wgpu custom backend/);
    }
  });
});
