export type LabScenario = {
  readonly id: string;
  readonly title: string;
  readonly useCase: string;
  readonly question: string;
  readonly frames: number;
  readonly path: string;
};

export const labScenarios: readonly LabScenario[] = [
  {
    id: "retained-map",
    title: "Navigate a dense map",
    useCase:
      "A user pans and zooms while hundreds of filled map features stay geometrically unchanged.",
    question:
      "How much does retained geometry help when only the shared camera transform changes?",
    frames: 90,
    path: "scenarios/retained-map/",
  },
  {
    id: "retained-map-churn",
    title: "Update one retained map chunk",
    useCase:
      "A user pans and zooms while one row-sized render-ready map chunk changes every few frames.",
    question:
      "Can custom WebGPU retain the rest of the map and reupload only the changed chunk?",
    frames: 90,
    path: "scenarios/retained-map-churn/",
  },
  {
    id: "retained-map-culling",
    title: "Cull off-screen retained map chunks",
    useCase:
      "A user navigates a map larger than the viewport while most retained chunks are wholly off-screen.",
    question:
      "Can producer-owned visibility reduce custom WebGPU draw calls without invalidating resident geometry?",
    frames: 90,
    path: "scenarios/retained-map-culling/",
  },
  {
    id: "maps-e2e-style",
    title: "Render a Maps-owned snapshot",
    useCase:
      "A Maps E2E fixture is exported after projection and style resolution as screen-space polygons and roads.",
    question:
      "Can the lab compare product-shaped Maps semantics without importing map authority or approximating unsupported primitives?",
    frames: 90,
    path: "scenarios/maps-e2e-style/",
  },
  {
    id: "flat-stories-curves",
    title: "Render Nova cubic paths",
    useCase:
      "A Flat Stories-derived curve slice repeats Nova's torso and hair cubic geometry across the same 36-copy grid used by its renderer benchmark.",
    question:
      "Can Canvas and pinned Vello preserve cubic path semantics while custom polygon backends remain explicitly unsupported?",
    frames: 90,
    path: "scenarios/flat-stories-curves/",
  },
  {
    id: "vector-animation",
    title: "Animate a vector story",
    useCase:
      "A story scene redraws figures whose transforms, fills, and strokes change independently every frame.",
    question:
      "How do the engines behave when general vector semantics matter more than retained map structure?",
    frames: 90,
    path: "scenarios/vector-animation/",
  },
  {
    id: "filled-polygons",
    title: "Redraw dense filled shapes",
    useCase:
      "A dense set of independently transformed filled polygons is redrawn without stroke or retained-map assumptions.",
    question:
      "What does the common fill-only denominator look like across Canvas, Vello, and custom WebGPU?",
    frames: 90,
    path: "scenarios/filled-polygons/",
  },
  {
    id: "map-like",
    title: "Render roads and polygons",
    useCase:
      "A map-like frame combines filled areas with open stroked road geometry.",
    question:
      "Which semantics are covered today, and what performance is visible where each engine can preserve them?",
    frames: 90,
    path: "scenarios/map-like/",
  },
];

export function findLabScenario(id: string | null): LabScenario | undefined {
  return labScenarios.find((scenario) => scenario.id === id);
}
