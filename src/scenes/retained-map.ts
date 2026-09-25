import type { DisplayList, PathCommand } from "../core/display-list";
import {
  RETAINED_MAP_FEATURES,
  retainedMapTransform,
} from "./retained-map-fixture";
import type { BenchmarkWorkload } from "./types";

const RETAINED_GEOMETRY_REVISION = "retained-map-static-v1";

function createRetainedMapScene(timeSeconds: number): DisplayList {
  const transform = retainedMapTransform(timeSeconds);
  const commands: PathCommand[] = RETAINED_MAP_FEATURES.map((feature) => ({
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
    retainedGeometryRevision: RETAINED_GEOMETRY_REVISION,
  };
}

export const retainedMapScene: BenchmarkWorkload = {
  id: "retained-map",
  name: "Map · retained geometry",
  description:
    "640 static map-like polygons share one changing pan/zoom transform. The custom retained backend can keep geometry on the GPU and upload only a tiny frame uniform while Canvas and Vello rebuild their normal frame work.",
  create: createRetainedMapScene,
};
