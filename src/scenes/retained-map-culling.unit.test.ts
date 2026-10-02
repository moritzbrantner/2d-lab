import { describe, expect, it } from "vitest";

import { validateDisplayList } from "../core/display-list";
import { retainedMapCullingScene } from "./retained-map-culling";

function chunkGeometryIsOffscreen(
  scene: ReturnType<typeof retainedMapCullingScene.create>,
  chunkIndex: number,
): boolean {
  const chunk = scene.retainedGeometryChunks![chunkIndex]!;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (
    let commandIndex = chunk.commandStart;
    commandIndex < chunk.commandStart + chunk.commandCount;
    commandIndex += 1
  ) {
    const command = scene.commands[commandIndex]!;
    const [a, b, c, d, e, f] = command.transform;
    for (let pointIndex = 0; pointIndex < command.points.length; pointIndex += 2) {
      const x = command.points[pointIndex]!;
      const y = command.points[pointIndex + 1]!;
      const screenX = a * x + c * y + e;
      const screenY = b * x + d * y + f;
      minX = Math.min(minX, screenX);
      minY = Math.min(minY, screenY);
      maxX = Math.max(maxX, screenX);
      maxY = Math.max(maxY, screenY);
    }
  }

  return (
    maxX < 0 ||
    minX > scene.width ||
    maxY < 0 ||
    minY > scene.height
  );
}

describe("retained map culling workload", () => {
  it("marks only conservatively off-screen chunks invisible", () => {
    const samples = [0, 0.75, 1.5, 2.25];
    const visibilitySignatures = new Set<string>();
    let revisions: readonly string[] | undefined;

    for (const timeSeconds of samples) {
      const scene = retainedMapCullingScene.create(timeSeconds);
      validateDisplayList(scene);
      const chunks = scene.retainedGeometryChunks!;
      const visibleCount = chunks.filter((chunk) => chunk.visible !== false).length;

      expect(visibleCount).toBeGreaterThan(0);
      expect(visibleCount).toBeLessThan(chunks.length);
      visibilitySignatures.add(
        chunks.map((chunk) => (chunk.visible === false ? "0" : "1")).join(""),
      );

      const currentRevisions = chunks.map((chunk) => chunk.revision);
      if (revisions === undefined) {
        revisions = currentRevisions;
      } else {
        expect(currentRevisions).toEqual(revisions);
      }

      for (const [chunkIndex, chunk] of chunks.entries()) {
        if (chunk.visible === false) {
          expect(chunkGeometryIsOffscreen(scene, chunkIndex)).toBe(true);
        }
      }
    }

    expect(visibilitySignatures.size).toBeGreaterThan(1);
  });
});
