import { packVelloFrame } from "../renderers/vello-frame";
import {
  packPolygonFrame,
  polygonRendererSupportError,
} from "../renderers/wgpu-polygon-frame";
import { filledPolygonScene } from "../scenes/filled-polygons";
import { flatStoriesCurveScene } from "../scenes/flat-stories-curves";
import { mapLikeScene } from "../scenes/map-like";
import { mapsE2eStyleWorkload } from "../scenes/maps-e2e-style";
import { retainedMapScene } from "../scenes/retained-map";
import { retainedMapCullingScene } from "../scenes/retained-map-culling";
import type { BenchmarkWorkload } from "../scenes/types";
import { vectorAnimationScene } from "../scenes/vector-animation";

/**
 * Named oracle scenarios: one deterministic frame of an existing lab workload. The native oracle
 * (`oracle/`) renders each with the custom WebGPU path, Vello and Skia (tiny-skia) from exactly
 * the arrays the browser adapters hand to Rust.
 */
export type OracleScenario = {
  readonly name: string;
  readonly capability: string;
  readonly workload: BenchmarkWorkload;
  readonly timeSeconds: number;
};

export const oracleScenarios: readonly OracleScenario[] = [
  {
    name: "fills",
    capability: "convex fills",
    workload: filledPolygonScene,
    timeSeconds: 0,
  },
  {
    name: "transforms",
    capability: "shared pan/zoom transform",
    workload: retainedMapScene,
    timeSeconds: 1.5,
  },
  {
    name: "strokes",
    capability: "open and closed strokes",
    workload: mapLikeScene,
    timeSeconds: 0,
  },
  {
    name: "vector-animation",
    capability: "per-figure transforms, fills, strokes",
    workload: vectorAnimationScene,
    timeSeconds: 0.5,
  },
  {
    name: "curves",
    capability: "cubic paths",
    workload: flatStoriesCurveScene,
    timeSeconds: 0,
  },
  {
    name: "maps-snapshot",
    capability: "product snapshot (polygons + lines)",
    workload: mapsE2eStyleWorkload,
    timeSeconds: 0,
  },
  {
    name: "scaling",
    capability: "2,560 primitives",
    workload: retainedMapCullingScene,
    timeSeconds: 0,
  },
];

/** JSON contract read by `oracle/src/scene.rs`. */
export type OracleSceneJson = {
  readonly name: string;
  readonly capability: string;
  readonly workload: string;
  readonly timeSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly commands: number;
  /** `packVelloFrame`: what Vello (and Skia) render. */
  readonly vello: Record<string, number[]>;
  /**
   * `packPolygonFrame`'s per-command fill colors; its points, spans and transforms are the Vello
   * frame's (both come from `flattenGeometry`). `error` is the custom path's support error.
   */
  readonly custom: { readonly error: string | null; readonly colors?: number[] };
};

export function exportOracleScene(scenario: OracleScenario): OracleSceneJson {
  const displayList = scenario.workload.create(scenario.timeSeconds);
  const vello = packVelloFrame(displayList);
  const error = polygonRendererSupportError(displayList, { debugBounds: false });
  let custom: OracleSceneJson["custom"] = { error };
  if (error === null) {
    const polygon = packPolygonFrame(displayList);
    for (const key of ["points", "spans", "transforms"] as const) {
      if (!sameValues(polygon[key], vello[key])) {
        throw new Error(`${scenario.name}: custom ${key} differ from the Vello frame`);
      }
    }
    custom = { error, colors: f32(polygon.colors) };
  }

  return {
    name: scenario.name,
    capability: scenario.capability,
    workload: scenario.workload.id,
    timeSeconds: scenario.timeSeconds,
    width: displayList.width,
    height: displayList.height,
    commands: displayList.commands.length,
    vello: {
      points: f32(vello.points),
      spans: Array.from(vello.spans),
      verbs: Array.from(vello.verbs),
      verbSpans: Array.from(vello.verbSpans),
      transforms: f32(vello.transforms),
      fillColors: f32(vello.fillColors),
      strokeColors: f32(vello.strokeColors),
      strokeWidths: f32(vello.strokeWidths),
      flags: Array.from(vello.flags),
      background: f32(vello.background),
    },
    custom,
  };
}

function sameValues(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/** Shortest decimal that parses back to the same f32, keeping the JSON small and exact. */
function f32(values: Float32Array): number[] {
  return Array.from(values, (value) => {
    for (let digits = 1; digits < 9; digits += 1) {
      const short = Number(value.toPrecision(digits));
      if (Math.fround(short) === value) return short;
    }
    return Number(value.toPrecision(9));
  });
}
