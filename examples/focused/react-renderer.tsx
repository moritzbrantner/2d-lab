import {
  VizEngineProvider,
  useVizDataset,
  useVizLayer,
  useVizTypedFrame,
} from "@moritzbrantner/viz-engine/react";
import { useMemo } from "react";

import type { VizSeriesPoint } from "@moritzbrantner/viz-engine/core";

export function FocusedReactRendererExample() {
  return (
    <VizEngineProvider backend="auto">
      <ReactSeries />
    </VizEngineProvider>
  );
}

function ReactSeries() {
  const points = useMemo(() => createPoints(720), []);
  const datasetId = useVizDataset({ kind: "xy", points }, { lifecycle: "update" });
  const layerId = useVizLayer(
    datasetId
      ? {
          datasetId,
          kind: "binned-series",
          targetBinCount: 120,
        }
      : null,
    { lifecycle: "update" },
  );
  const frame = useVizTypedFrame({
    layerIds: layerId ? [layerId] : [],
    viewport: { height: 220, width: 640, xDomain: [0, points.length - 1] },
  });
  const layer = frame.layers[0];

  if (!layer || layer.kind !== "binned-series" || !("typedSeries" in layer)) {
    return <svg viewBox="0 0 640 220" role="img" aria-label="Empty series" />;
  }

  const path = createPath([...layer.typedSeries.y], 640, 220);

  return (
    <svg viewBox="0 0 640 220" role="img" aria-label="Binned series">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function createPoints(count: number): VizSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `point-${index}`,
    x: index,
    y: Math.sin(index / 18) * 12 + Math.cos(index / 41) * 6,
  }));
}

function createPath(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  return values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}
