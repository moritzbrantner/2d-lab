import type {
  Affine2D,
  DisplayList,
  PathCommand,
  RetainedGeometryChunk,
} from "../core/display-list";
import {
  createRetainedMapFeatures,
  type RetainedMapFeature,
} from "./retained-map-fixture";
import type { BenchmarkWorkload } from "./types";

const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 720;
const WORLD_COLUMNS = 64;
const WORLD_ROWS = 40;
const CHUNK_COLUMNS = 8;
const CHUNK_ROWS = 8;
const CELL_WIDTH = 39;
const CELL_HEIGHT = 36;

interface ChunkFixture {
  readonly commandStart: number;
  readonly commandCount: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const SOURCE_FEATURES = createRetainedMapFeatures(
  WORLD_COLUMNS,
  WORLD_ROWS,
);
const ORDERED_FEATURES: RetainedMapFeature[] = [];
const CHUNKS: ChunkFixture[] = [];

for (let chunkRow = 0; chunkRow < WORLD_ROWS; chunkRow += CHUNK_ROWS) {
  for (
    let chunkColumn = 0;
    chunkColumn < WORLD_COLUMNS;
    chunkColumn += CHUNK_COLUMNS
  ) {
    const commandStart = ORDERED_FEATURES.length;
    for (let row = chunkRow; row < chunkRow + CHUNK_ROWS; row += 1) {
      for (
        let column = chunkColumn;
        column < chunkColumn + CHUNK_COLUMNS;
        column += 1
      ) {
        ORDERED_FEATURES.push(
          SOURCE_FEATURES[row * WORLD_COLUMNS + column]!,
        );
      }
    }

    CHUNKS.push({
      commandStart,
      commandCount: CHUNK_COLUMNS * CHUNK_ROWS,
      minX: chunkColumn * CELL_WIDTH,
      minY: chunkRow * CELL_HEIGHT,
      maxX: (chunkColumn + CHUNK_COLUMNS) * CELL_WIDTH,
      maxY: (chunkRow + CHUNK_ROWS) * CELL_HEIGHT,
    });
  }
}

function navigationTransform(timeSeconds: number): Affine2D {
  const zoom = 0.82 + Math.sin(timeSeconds * 0.43) * 0.07;
  const worldWidth = WORLD_COLUMNS * CELL_WIDTH * zoom;
  const worldHeight = WORLD_ROWS * CELL_HEIGHT * zoom;
  const maxPanX = Math.max(0, worldWidth - VIEWPORT_WIDTH);
  const maxPanY = Math.max(0, worldHeight - VIEWPORT_HEIGHT);
  const travelX = (Math.sin(timeSeconds * 0.9) + 1) * 0.5;
  const travelY = (Math.cos(timeSeconds * 0.7) + 1) * 0.5;
  return [
    zoom,
    0,
    0,
    zoom,
    -maxPanX * travelX,
    -maxPanY * travelY,
  ];
}

function isChunkVisible(
  chunk: ChunkFixture,
  transform: Affine2D,
): boolean {
  const left = transform[0] * chunk.minX + transform[4];
  const right = transform[0] * chunk.maxX + transform[4];
  const top = transform[3] * chunk.minY + transform[5];
  const bottom = transform[3] * chunk.maxY + transform[5];

  return (
    right >= 0 &&
    left <= VIEWPORT_WIDTH &&
    bottom >= 0 &&
    top <= VIEWPORT_HEIGHT
  );
}

function createRetainedMapCullingScene(timeSeconds: number): DisplayList {
  const transform = navigationTransform(timeSeconds);
  const commands: PathCommand[] = ORDERED_FEATURES.map((feature) => ({
    kind: "path",
    points: feature.points,
    closed: true,
    transform,
    paint: { fill: feature.fill },
  }));
  const retainedGeometryChunks: RetainedGeometryChunk[] = CHUNKS.map(
    (chunk, index) => ({
      commandStart: chunk.commandStart,
      commandCount: chunk.commandCount,
      revision: `retained-map-culling:${index}:v1`,
      visible: isChunkVisible(chunk, transform),
    }),
  );

  return {
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    background: "#f5f1e8",
    commands,
    retainedGeometryChunks,
  };
}

export const retainedMapCullingScene: BenchmarkWorkload = {
  id: "retained-map-culling",
  name: "Map · retained chunk culling",
  description:
    "2,560 static polygons are grouped into 40 producer-owned render chunks across a world larger than the viewport. Geometry stays resident while conservative per-frame visibility lets the custom Rust/WASM backend omit draw calls for wholly off-screen chunks.",
  create: createRetainedMapCullingScene,
};
