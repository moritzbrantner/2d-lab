import type {
  DisplayList,
  PathCommand,
  RetainedGeometryChunk,
} from "../core/display-list";
import {
  RETAINED_MAP_COLUMNS,
  RETAINED_MAP_FEATURES,
  RETAINED_MAP_ROWS,
  retainedMapTransform,
} from "./retained-map-fixture";
import type { BenchmarkWorkload } from "./types";

const CHANGES_PER_SECOND = 3;

function rowUpdateCount(row: number, updateEpoch: number): number {
  if (updateEpoch <= row) {
    return 0;
  }
  return Math.floor((updateEpoch - row - 1) / RETAINED_MAP_ROWS) + 1;
}

function createRetainedMapChurnScene(timeSeconds: number): DisplayList {
  const transform = retainedMapTransform(timeSeconds);
  const updateEpoch = Math.floor(timeSeconds * CHANGES_PER_SECOND + 1e-9);
  const rowUpdates = Array.from(
    { length: RETAINED_MAP_ROWS },
    (_, row) => rowUpdateCount(row, updateEpoch),
  );

  const commands: PathCommand[] = RETAINED_MAP_FEATURES.map((feature) => ({
    kind: "path",
    points:
      rowUpdates[feature.row]! % 2 === 0
        ? feature.points
        : feature.alternatePoints,
    closed: true,
    transform,
    paint: { fill: feature.fill },
  }));

  const retainedGeometryChunks: RetainedGeometryChunk[] = rowUpdates.map(
    (updateCount, row) => ({
      commandStart: row * RETAINED_MAP_COLUMNS,
      commandCount: RETAINED_MAP_COLUMNS,
      revision: `retained-map-row:${row}:update:${updateCount}`,
    }),
  );

  return {
    width: 1200,
    height: 720,
    background: "#f5f1e8",
    commands,
    retainedGeometryChunks,
  };
}

export const retainedMapChurnScene: BenchmarkWorkload = {
  id: "retained-map-churn",
  name: "Map · retained chunk churn",
  description:
    "The 640-polygon map is partitioned into 20 contiguous render-ready chunks. One row-sized chunk changes every ten benchmark frames, so the custom backend can measure the tradeoff between extra draw calls and reuploading only changed geometry.",
  create: createRetainedMapChurnScene,
};
