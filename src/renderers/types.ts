import type { DisplayList } from "../core/display-list";

export interface RenderOptions {
  readonly debugBounds: boolean;
}

export interface FrameStats {
  readonly prepareMs: number;
  readonly drawMs: number;
  readonly commandCount: number;
  readonly pointCount: number;
  readonly wasmCalls: number;
}

export interface Renderer {
  readonly id: string;
  readonly name: string;
  render(
    context: CanvasRenderingContext2D,
    displayList: DisplayList,
    options: RenderOptions,
  ): Promise<FrameStats>;
}
