import type { DisplayList } from "../core/display-list";

export interface RenderOptions {
  readonly debugBounds: boolean;
}

export interface FrameStats {
  readonly prepareMs: number;
  readonly uploadMs: number;
  readonly renderMs: number;
  readonly commandCount: number;
  readonly pointCount: number;
  readonly wasmCalls: number;
  readonly drawCalls: number | null;
  readonly vertexCount: number | null;
  readonly uploadBytes: number | null;
}

export interface Renderer {
  readonly id: string;
  readonly name: string;
  support(
    displayList: DisplayList,
    options: RenderOptions,
  ): string | null;
  render(
    canvas: HTMLCanvasElement,
    displayList: DisplayList,
    options: RenderOptions,
  ): Promise<FrameStats>;
  dispose?(canvas: HTMLCanvasElement): Promise<void> | void;
}
