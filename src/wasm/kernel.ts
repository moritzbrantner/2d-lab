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
    return module;
  })();

  return kernelPromise;
}
