import { filledPolygonScene } from "./scenes/filled-polygons";
import { mapLikeScene } from "./scenes/map-like";
import { retainedMapScene } from "./scenes/retained-map";
import type { BenchmarkWorkload } from "./scenes/types";
import { vectorAnimationScene } from "./scenes/vector-animation";

export interface LabScenario {
  readonly id: string;
  readonly title: string;
  readonly useCase: string;
  readonly question: string;
  readonly frames: number;
  readonly workload: BenchmarkWorkload;
}

export const labScenarios: readonly LabScenario[] = [
  {
    id: retainedMapScene.id,
    title: "Navigate a dense map",
    useCase:
      "A user pans and zooms while hundreds of filled map features stay geometrically unchanged.",
    question:
      "How much does retained geometry help when only the shared camera transform changes?",
    frames: 90,
    workload: retainedMapScene,
  },
  {
    id: vectorAnimationScene.id,
    title: "Animate a vector story",
    useCase:
      "A story scene redraws figures whose transforms, fills, and strokes change independently every frame.",
    question:
      "How do the engines behave when general vector semantics matter more than retained map structure?",
    frames: 90,
    workload: vectorAnimationScene,
  },
  {
    id: filledPolygonScene.id,
    title: "Redraw dense filled shapes",
    useCase:
      "A dense set of independently transformed filled polygons is redrawn without stroke or retained-map assumptions.",
    question:
      "What does the common fill-only denominator look like across Canvas, Vello, and custom WebGPU?",
    frames: 90,
    workload: filledPolygonScene,
  },
  {
    id: mapLikeScene.id,
    title: "Render roads and polygons",
    useCase:
      "A map-like frame combines filled areas with open stroked road geometry.",
    question:
      "Which semantics are covered today, and what performance is visible where each engine can preserve them?",
    frames: 90,
    workload: mapLikeScene,
  },
];

export function findLabScenario(id: string | null): LabScenario | undefined {
  return labScenarios.find((scenario) => scenario.id === id);
}
