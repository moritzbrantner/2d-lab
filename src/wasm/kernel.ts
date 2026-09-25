import { transformBatches } from "../geometry/transform";

export interface VizRenderKernel {
  transform_batches(
    points: Float32Array,
    spans: Uint32Array,
    transforms: Float32Array,
  ): Float32Array;
}

export interface WgpuPolygonRendererWasm {
  free?: () => void;
  isDeviceLost(): boolean;
  resize(width: number, height: number): void;
  render(
    points: Float32Array,
    spans: Uint32Array,
    transforms: Float32Array,
    colors: Float32Array,
    background: Float32Array,
    width: number,
    height: number,
  ): Float64Array;
}

export interface RetainedWgpuPolygonRendererWasm {
  free?: () => void;
  isDeviceLost(): boolean;
  uploadGeometry(
    points: Float32Array,
    spans: Uint32Array,
    colors: Float32Array,
  ): Float64Array;
  uploadGeometryChunk(
    chunkIndex: number,
    points: Float32Array,
    spans: Uint32Array,
    colors: Float32Array,
  ): Float64Array;
  truncateGeometryChunks(chunkCount: number): void;
  render(
    transform: Float32Array,
    background: Float32Array,
    width: number,
    height: number,
  ): Float64Array;
}

export interface VelloGpuRendererWasm {
  free?: () => void;
  isDeviceLost(): boolean;
  render(
    points: Float32Array,
    spans: Uint32Array,
    verbs: Uint32Array,
    verbSpans: Uint32Array,
    transforms: Float32Array,
    fillColors: Float32Array,
    strokeColors: Float32Array,
    strokeWidths: Float32Array,
    flags: Uint32Array,
    background: Float32Array,
    width: number,
    height: number,
  ): Float64Array;
}

export interface VizRenderModule extends VizRenderKernel {
  default(): Promise<unknown>;
  createWgpuPolygonRenderer?: (
    canvas: HTMLCanvasElement,
  ) => Promise<WgpuPolygonRendererWasm>;
  createRetainedWgpuPolygonRenderer?: (
    canvas: HTMLCanvasElement,
  ) => Promise<RetainedWgpuPolygonRendererWasm>;
  createVelloGpuRenderer?: (
    canvas: HTMLCanvasElement,
  ) => Promise<VelloGpuRendererWasm>;
}

export interface CustomWgpuModule extends VizRenderModule {
  createWgpuPolygonRenderer(
    canvas: HTMLCanvasElement,
  ): Promise<WgpuPolygonRendererWasm>;
  createRetainedWgpuPolygonRenderer(
    canvas: HTMLCanvasElement,
  ): Promise<RetainedWgpuPolygonRendererWasm>;
}

function verifyAffineAbi(kernel: VizRenderKernel): void {
  const geometry = {
    points: new Float32Array([0, 0, 2, 1, -3, 4, 5, -2]),
    spans: new Uint32Array([0, 4, 4, 4]),
    transforms: new Float32Array([
      1.25, 0.2, -0.1, 0.8, 12, -7,
      0.5, -0.3, 0.4, 1.1, -2, 6,
    ]),
  };

  const expected = transformBatches(geometry);
  const actual = kernel.transform_batches(
    geometry.points,
    geometry.spans,
    geometry.transforms,
  );

  if (actual.length !== expected.length) {
    throw new Error("Rust/WASM transform ABI returned an unexpected length");
  }

  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs((actual[index] ?? 0) - (expected[index] ?? 0));
    if (difference > 1e-5) {
      throw new Error(
        `Rust/WASM transform ABI differs from the TypeScript reference at float ${index}`,
      );
    }
  }
}

let modulePromise: Promise<VizRenderModule> | undefined;

export function loadVizRenderModule(): Promise<VizRenderModule> {
  modulePromise ??= (async () => {
    const moduleUrl = new URL(
      `${import.meta.env.BASE_URL}wasm/viz_render_kernel.js`,
      window.location.origin,
    ).href;

    const module = (await import(
      /* @vite-ignore */ moduleUrl
    )) as VizRenderModule;
    await module.default();
    verifyAffineAbi(module);
    return module;
  })();

  return modulePromise;
}

export async function loadVizRenderKernel(): Promise<VizRenderKernel> {
  return loadVizRenderModule();
}

export async function loadCustomWgpuModule(): Promise<CustomWgpuModule> {
  const module = await loadVizRenderModule();
  if (
    !module.createWgpuPolygonRenderer ||
    !module.createRetainedWgpuPolygonRenderer
  ) {
    throw new Error(
      "2d-lab custom rendering requires the Rust/WASM kernel with both wgpu backends.",
    );
  }
  return module as CustomWgpuModule;
}
