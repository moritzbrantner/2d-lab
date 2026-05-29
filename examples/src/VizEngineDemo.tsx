import { useMemo } from "react";

import type { ChartSeriesPoint } from "@moritzbrantner/charts";

import {
  VizEngineProvider,
  useVizDataset,
  useVizFrame,
  useVizLayer,
  type VizRenderLayer,
} from "../../src";

type VizEngineDemoProps = {
  points: readonly ChartSeriesPoint[];
};

const viewport = {
  height: 320,
  width: 800,
  xDomain: [0, 1440] as [number, number],
};

export function VizEngineDemo({ points }: VizEngineDemoProps) {
  return (
    <VizEngineProvider backend="auto">
      <VizEngineDemoLayers points={points} />
    </VizEngineProvider>
  );
}

function VizEngineDemoLayers({ points }: VizEngineDemoProps) {
  const datasetId = useVizDataset(points);
  const binnedLayer = useMemo(
    () =>
      datasetId
        ? {
            datasetId,
            kind: "binned-series" as const,
            targetBinCount: 120,
            valueMode: "average" as const,
            xDomain: viewport.xDomain,
          }
        : null,
    [datasetId],
  );
  const histogramLayer = useMemo(
    () =>
      datasetId
        ? {
            bucketCount: 32,
            datasetId,
            kind: "histogram" as const,
            xDomain: viewport.xDomain,
          }
        : null,
    [datasetId],
  );
  const binnedLayerId = useVizLayer(binnedLayer);
  const histogramLayerId = useVizLayer(histogramLayer);
  const frame = useVizFrame(viewport, [binnedLayerId, histogramLayerId]);

  return (
    <figure>
      <svg
        aria-label="Viz engine demo"
        height={viewport.height}
        role="img"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        width={viewport.width}
      >
        {frame.layers.map((layer) => (
          <VizEngineLayer key={layer.layerId} layer={layer} />
        ))}
      </svg>
      <figcaption>
        {frame.stats.backend} backend, {frame.stats.datasetCount} dataset, {frame.stats.layerCount}{" "}
        layers
      </figcaption>
    </figure>
  );
}

function VizEngineLayer({ layer }: { layer: VizRenderLayer }) {
  if (layer.kind === "histogram") {
    const maxCount = Math.max(1, ...layer.buckets.map((bucket) => bucket.pointCount));
    const barWidth = viewport.width / Math.max(1, layer.buckets.length);

    return (
      <g opacity={0.24}>
        {layer.buckets.map((bucket) => {
          const height = (bucket.pointCount / maxCount) * 96;

          return (
            <rect
              fill="currentColor"
              height={height}
              key={bucket.index}
              width={Math.max(1, barWidth - 1)}
              x={bucket.index * barWidth}
              y={viewport.height - height}
            />
          );
        })}
      </g>
    );
  }

  if (layer.kind !== "binned-series") {
    return null;
  }

  const yValues = layer.rows.map((row) => row.value).filter((value) => value !== null);
  const maxY = Math.max(1, ...yValues);
  const path = layer.rows
    .filter((row) => row.value !== null)
    .map((row, index) => {
      const x =
        ((row.x - viewport.xDomain[0]) / (viewport.xDomain[1] - viewport.xDomain[0])) *
        viewport.width;
      const y = viewport.height - ((row.value ?? 0) / maxY) * (viewport.height - 24) - 12;

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />;
}
