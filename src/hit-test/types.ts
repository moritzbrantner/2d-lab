import type { VizGeoBounds, VizLayer, VizRenderBounds } from "../types";

export type HitLayerBase = {
  bounds: VizGeoBounds | VizRenderBounds | null;
  datasetId: string;
  kind: VizLayer["kind"];
  layerId: string;
};
