import type { DisplayList, PathCommand } from "../core/display-list";
import { countPoints } from "../core/display-list";
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

interface GeometrySnapshot {
  readonly pointValues: readonly Float32Array[];
  readonly fills: readonly string[];
  readonly vertexCount: number;
}

interface RetainedState {
  readonly renderer: Promise<RetainedWgpuPolygonRendererWasm>;
  geometry?: GeometrySnapshot;
}

const stateByCanvas = new WeakMap<HTMLCanvasElement, RetainedState>();

function stateFor(canvas: HTMLCanvasElement): RetainedState {
  let state = stateByCanvas.get(canvas);
  if (!state) {
    const renderer = (async () => {
      const module = await loadVizRenderModule();
      if (!module.createRetainedWgpuPolygonRenderer) {
        throw new Error(
          "This WASM package does not expose the retained WebGPU renderer.",
        );
      }
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
    const geometryChanged = !sameGeometry(
      state.geometry,
      displayList.commands,
    );
    let prepareMs = performance.now() - geometryCheckStart;
    let uploadMs = 0;
    let uploadBytes = 0;
    let wasmCalls = 1;

    if (geometryChanged) {
      const packStart = performance.now();
      const packed = packPolygonFrame(displayList);
      prepareMs += performance.now() - packStart;

      const upload = renderer.uploadGeometry(
        packed.points,
        packed.spans,
        packed.colors,
      );
      prepareMs += upload[0] ?? 0;
      uploadMs += upload[1] ?? 0;
      uploadBytes += Math.trunc(upload[3] ?? 0);
      state.geometry = {
        pointValues: displayList.commands.map((command) =>
          command.points.slice(),
        ),
        fills: displayList.commands.map((command) => command.paint.fill!),
        vertexCount: Math.trunc(upload[2] ?? 0),
      };
      wasmCalls += 1;
    }

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
      vertexCount:
        state.geometry?.vertexCount ?? Math.trunc(metrics[4] ?? 0),
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

function sameGeometry(
  snapshot: GeometrySnapshot | undefined,
  commands: readonly PathCommand[],
): boolean {
  if (!snapshot || snapshot.pointValues.length !== commands.length) {
    return false;
  }

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!;
    const previous = snapshot.pointValues[index]!;
    if (
      snapshot.fills[index] !== command.paint.fill ||
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
