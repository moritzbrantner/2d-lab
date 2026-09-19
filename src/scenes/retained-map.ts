import type {
  Affine2D,
  DisplayList,
  PathCommand,
} from "../core/display-list";
import type { BenchmarkWorkload } from "./types";

interface StaticFeature {
  readonly points: Float32Array;
  readonly fill: string;
}

const PALETTE = [
  "#d8dfca",
  "#e7deca",
  "#d6e0df",
  "#e5d6cf",
  "#ded8e8",
] as const;

const FEATURES: readonly StaticFeature[] = Array.from(
  { length: 32 * 20 },
  (_, index) => {
    const column = index % 32;
    const row = Math.floor(index / 32);
    const x = column * 39;
    const y = row * 36;
    const inset = ((row * 11 + column * 17) % 6) * 0.55;

    return {
      points: new Float32Array([
        x + inset,
        y + inset,
        x + 31 - inset,
        y + 1,
        x + 34,
        y + 27 - inset,
        x + 3,
        y + 29,
      ]),
      fill: PALETTE[(row * 3 + column * 7) % PALETTE.length]!,
    };
  },
);

function worldTransform(timeSeconds: number): Affine2D {
  const zoom = 0.96 + Math.sin(timeSeconds * 0.31) * 0.035;
  const panX = -35 + Math.sin(timeSeconds * 0.52) * 28;
  const panY = -10 + Math.cos(timeSeconds * 0.44) * 18;
  return [zoom, 0, 0, zoom, panX, panY];
}

function createRetainedMapScene(timeSeconds: number): DisplayList {
  const transform = worldTransform(timeSeconds);
  const commands: PathCommand[] = FEATURES.map((feature) => ({
    kind: "path",
    points: feature.points,
    closed: true,
    transform,
    paint: { fill: feature.fill },
  }));

  return {
    width: 1200,
    height: 720,
    background: "#f5f1e8",
    commands,
  };
}

export const retainedMapScene: BenchmarkWorkload = {
  id: "retained-map",
  name: "Map · retained geometry",
  description:
    "640 static map-like polygons share one changing pan/zoom transform. The custom retained backend can keep geometry on the GPU and upload only a tiny frame uniform while Canvas and Vello rebuild their normal frame work.",
  create: createRetainedMapScene,
};
