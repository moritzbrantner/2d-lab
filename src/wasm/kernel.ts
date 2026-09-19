import { transformBatches } from "../geometry/transform";

export interface VizRenderKernel {
  transform_batches(
    points: Float32Array,
    spans: Uint32Array,
    transforms: Float32Array,
  ): Float32Array;
}

interface VizRenderKernelModule extends VizRenderKernel {
  default(): Promise<unknown>;
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

let kernelPromise: Promise<VizRenderKernel> | undefined;

export function loadVizRenderKernel(): Promise<VizRenderKernel> {
  kernelPromise ??= (async () => {
    const moduleUrl = new URL(
      `${import.meta.env.BASE_URL}wasm/viz_render_kernel.js`,
      window.location.origin,
    ).href;

    const module = (await import(
      /* @vite-ignore */ moduleUrl
    )) as VizRenderKernelModule;
    await module.default();
    verifyAffineAbi(module);
    return module;
  })();

  return kernelPromise;
}
