import type { DisplayList, PathCommand } from "../core/display-list";
import {
  countPoints,
  retainedGeometryMetadataError,
} from "../core/display-list";
import { parseHexColor } from "../geometry/color";
import {
  loadCustomWgpuModule,
  type RetainedWgpuPolygonRendererWasm,
} from "../wasm/kernel";
import { ensureCanvasSize } from "./canvas-surface";
import type { Renderer } from "./types";
import {
  packPolygonFrame,
  polygonRendererSupportError,
} from "./wgpu-polygon-frame";

export interface RetainedGeometryChunkPlan {
  readonly commandStart: number;
  readonly commandCount: number;
  readonly revision?: string;
}

interface RevisionGeometrySnapshot {
  readonly commandStart: number;
  readonly commandCount: number;
  readonly revision: string;
  readonly vertexCount: number;
}

interface ValueGeometrySnapshot {
  readonly commandStart: number;
  readonly commandCount: number;
  readonly pointValues: readonly Float32Array[];
  readonly fills: readonly string[];
  readonly vertexCount: number;
}

export type RetainedGeometrySnapshot =
  | RevisionGeometrySnapshot
  | ValueGeometrySnapshot;

interface RetainedState {
  readonly renderer: Promise<RetainedWgpuPolygonRendererWasm>;
  geometry?: readonly RetainedGeometrySnapshot[];
}

const stateByCanvas = new WeakMap<HTMLCanvasElement, RetainedState>();

function stateFor(canvas: HTMLCanvasElement): RetainedState {
  let state = stateByCanvas.get(canvas);
  if (!state) {
    const renderer = (async () => {
      const module = await loadCustomWgpuModule();
      return module.createRetainedWgpuPolygonRenderer(canvas);
    })().catch((error: unknown) => {
      stateByCanvas.delete(canvas);
      throw error;
    });

    state = { renderer };
    stateByCanvas.set(canvas, state);
  }
  return state;
}

export function retainedRendererSupportError(
  displayList: DisplayList,
  debugBounds: boolean,
): string | null {
  const metadataError = retainedGeometryMetadataError(displayList);
  if (metadataError) {
    return metadataError;
  }

  const polygonError = polygonRendererSupportError(displayList, {
    debugBounds,
  });
  if (polygonError) {
    return polygonError;
  }
  if (displayList.commands.length === 0) {
    return null;
  }

  const first = displayList.commands[0]!.transform;
  for (let index = 1; index < displayList.commands.length; index += 1) {
    if (!sameTransform(first, displayList.commands[index]!.transform)) {
      return (
        "The retained map backend requires one shared frame transform; " +
        `command ${index} has a different transform.`
      );
    }
  }

  return null;
}

/** @internal Exported so retained chunk invalidation can be regression tested. */
export function retainedGeometryChunkPlan(
  displayList: DisplayList,
): readonly RetainedGeometryChunkPlan[] {
  if (displayList.retainedGeometryChunks !== undefined) {
    return displayList.retainedGeometryChunks;
  }
  if (displayList.commands.length === 0) {
    return [];
  }

  return [
    {
      commandStart: 0,
      commandCount: displayList.commands.length,
      ...(displayList.retainedGeometryRevision === undefined
        ? {}
        : { revision: displayList.retainedGeometryRevision }),
    },
  ];
}

export const retainedWgpuRenderer: Renderer = {
  id: "wgpu-retained-map",
  name: "WebGPU · custom retained map geometry",
  support(displayList, options) {
    return retainedRendererSupportError(
      displayList,
      options.debugBounds,
    );
  },
  async render(canvas, displayList, options) {
    const supportError = retainedRendererSupportError(
      displayList,
      options.debugBounds,
    );
    if (supportError) {
      throw new Error(supportError);
    }

    ensureCanvasSize(canvas, displayList);
    const state = stateFor(canvas);
    const renderer = await state.renderer;
    if (renderer.isDeviceLost()) {
      throw new Error("The retained WebGPU device was lost.");
    }

    const geometryCheckStart = performance.now();
    const plans = retainedGeometryChunkPlan(displayList);
    const previousGeometry = state.geometry ?? [];
    const nextGeometry = new Array<RetainedGeometrySnapshot>(plans.length);
    let prepareMs = performance.now() - geometryCheckStart;
    let uploadMs = 0;
    let uploadBytes = 0;
    let wasmCalls = 1;

    for (const [chunkIndex, plan] of plans.entries()) {
      const previous = previousGeometry[chunkIndex];
      if (
        retainedGeometryChunkMatchesSnapshot(
          previous,
          displayList,
          plan,
        )
      ) {
        nextGeometry[chunkIndex] = previous!;
        continue;
      }

      const packStart = performance.now();
      const chunkDisplayList: DisplayList = {
        width: displayList.width,
        height: displayList.height,
        background: displayList.background,
        commands: displayList.commands.slice(
          plan.commandStart,
          plan.commandStart + plan.commandCount,
        ),
      };
      const packed = packPolygonFrame(chunkDisplayList);
      prepareMs += performance.now() - packStart;

      const upload = renderer.uploadGeometryChunk(
        chunkIndex,
        packed.points,
        packed.spans,
        packed.colors,
      );
      prepareMs += upload[0] ?? 0;
      uploadMs += upload[1] ?? 0;
      uploadBytes += Math.trunc(upload[3] ?? 0);
      nextGeometry[chunkIndex] = createRetainedGeometryChunkSnapshot(
        displayList,
        plan,
        Math.trunc(upload[2] ?? 0),
      );
      wasmCalls += 1;
    }

    if (previousGeometry.length > plans.length) {
      renderer.truncateGeometryChunks(plans.length);
      wasmCalls += 1;
    }
    state.geometry = nextGeometry;

    const framePackStart = performance.now();
    const transform = new Float32Array(
      displayList.commands[0]?.transform ?? [1, 0, 0, 1, 0, 0],
    );
    const backgroundColor = parseHexColor(displayList.background);
    if (!backgroundColor) {
      throw new Error("retained background could not be encoded");
    }
    const background = new Float32Array(backgroundColor);
    prepareMs += performance.now() - framePackStart;

    const metrics = renderer.render(
      transform,
      background,
      displayList.width,
      displayList.height,
    );
    uploadMs += metrics[0] ?? 0;
    uploadBytes += Math.trunc(metrics[3] ?? 0);

    return {
      prepareMs,
      uploadMs,
      renderMs: metrics[1] ?? 0,
      commandCount: displayList.commands.length,
      pointCount: countPoints(displayList),
      wasmCalls,
      drawCalls: Math.trunc(metrics[2] ?? 0),
      vertexCount: nextGeometry.reduce(
        (total, snapshot) => total + snapshot.vertexCount,
        0,
      ),
      uploadBytes,
    };
  },
  async dispose(canvas) {
    const state = stateByCanvas.get(canvas);
    stateByCanvas.delete(canvas);
    if (!state) {
      return;
    }

    try {
      const renderer = await state.renderer;
      renderer.free?.();
    } catch {
      // Initialization failure already surfaced through render().
    }
  },
};

/** @internal Exported only so the revision/fallback contract can be regression tested. */
export function createRetainedGeometryChunkSnapshot(
  displayList: DisplayList,
  plan: RetainedGeometryChunkPlan,
  vertexCount: number,
): RetainedGeometrySnapshot {
  if (plan.revision !== undefined) {
    return {
      commandStart: plan.commandStart,
      commandCount: plan.commandCount,
      revision: plan.revision,
      vertexCount,
    };
  }

  const commands = displayList.commands.slice(
    plan.commandStart,
    plan.commandStart + plan.commandCount,
  );
  return {
    commandStart: plan.commandStart,
    commandCount: plan.commandCount,
    pointValues: commands.map((command) => command.points.slice()),
    fills: commands.map((command) => command.paint.fill!),
    vertexCount,
  };
}

/** @internal Exported only so chunk invalidation can be regression tested. */
export function retainedGeometryChunkMatchesSnapshot(
  snapshot: RetainedGeometrySnapshot | undefined,
  displayList: DisplayList,
  plan: RetainedGeometryChunkPlan,
): boolean {
  if (
    !snapshot ||
    snapshot.commandStart !== plan.commandStart ||
    snapshot.commandCount !== plan.commandCount
  ) {
    return false;
  }

  if (plan.revision !== undefined) {
    return "revision" in snapshot && snapshot.revision === plan.revision;
  }
  if ("revision" in snapshot) {
    return false;
  }

  if (snapshot.pointValues.length !== plan.commandCount) {
    return false;
  }

  for (
    let chunkCommandIndex = 0;
    chunkCommandIndex < plan.commandCount;
    chunkCommandIndex += 1
  ) {
    const command =
      displayList.commands[plan.commandStart + chunkCommandIndex]!;
    const previous = snapshot.pointValues[chunkCommandIndex]!;
    if (
      snapshot.fills[chunkCommandIndex] !== command.paint.fill ||
      previous.length !== command.points.length
    ) {
      return false;
    }

    for (let pointIndex = 0; pointIndex < previous.length; pointIndex += 1) {
      if (previous[pointIndex] !== command.points[pointIndex]) {
        return false;
      }
    }
  }
  return true;
}

/** @internal Compatibility helper for the monolithic retained contract tests. */
export function createRetainedGeometrySnapshot(
  displayList: DisplayList,
  vertexCount: number,
): RetainedGeometrySnapshot {
  return createRetainedGeometryChunkSnapshot(
    displayList,
    {
      commandStart: 0,
      commandCount: displayList.commands.length,
      ...(displayList.retainedGeometryRevision === undefined
        ? {}
        : { revision: displayList.retainedGeometryRevision }),
    },
    vertexCount,
  );
}

/** @internal Compatibility helper for the monolithic retained contract tests. */
export function retainedGeometryMatchesSnapshot(
  snapshot: RetainedGeometrySnapshot | undefined,
  displayList: DisplayList,
): boolean {
  return retainedGeometryChunkMatchesSnapshot(
    snapshot,
    displayList,
    {
      commandStart: 0,
      commandCount: displayList.commands.length,
      ...(displayList.retainedGeometryRevision === undefined
        ? {}
        : { revision: displayList.retainedGeometryRevision }),
    },
  );
}

function sameTransform(
  left: PathCommand["transform"],
  right: PathCommand["transform"],
): boolean {
  for (let index = 0; index < 6; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
