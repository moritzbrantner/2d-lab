import type { BenchmarkWorkload } from "./scenes/types";

export async function loadScenarioWorkload(
  scenarioId: string,
): Promise<BenchmarkWorkload> {
  switch (scenarioId) {
    case "retained-map":
      return (await import("./scenes/retained-map")).retainedMapScene;
    case "maps-e2e-style":
      return (await import("./scenes/maps-e2e-style")).mapsE2eStyleWorkload;
    case "flat-stories-curves":
      return (await import("./scenes/flat-stories-curves")).flatStoriesCurveScene;
    case "vector-animation":
      return (await import("./scenes/vector-animation")).vectorAnimationScene;
    case "filled-polygons":
      return (await import("./scenes/filled-polygons")).filledPolygonScene;
    case "map-like":
      return (await import("./scenes/map-like")).mapLikeScene;
    default:
      throw new Error(`unknown scenario: ${scenarioId}`);
  }
}
