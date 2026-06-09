// Demonstrates geo viewport clustering using @moritzbrantner/viz-engine/core.
// Mount from a local app or copy the renderer pattern into a consumer project.
import { createVizEngine, type VizGeoPoint } from "@moritzbrantner/viz-engine/core";

export function mountGeoViewportExample(root: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 360;
  root.replaceChildren(canvas);

  const points = createCityPoints();
  const engine = createVizEngine({ backend: "auto" });
  const datasetId = engine.addDataset({ kind: "geo-points", points });

  engine.addLayer({
    datasetId,
    kind: "geo-clusters",
    radius: 48,
  });

  const viewport = {
    bounds: [-125, 25, -66, 50] as [number, number, number, number],
    center: [-98, 39] as [number, number],
    display: "flat" as const,
    height: canvas.height,
    kind: "geo" as const,
    width: canvas.width,
    zoom: 4,
  };
  const frame = engine.computeFrame({ viewport });
  const layer = frame.layers.find((candidate) => candidate.kind === "geo-clusters");
  const context = canvas.getContext("2d");

  if (!context || !layer || layer.kind !== "geo-clusters" || !("typedGeoClusters" in layer)) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f766e";

  for (let index = 0; index < layer.typedGeoClusters.longitude.length; index += 1) {
    const [x, y] = project(
      layer.typedGeoClusters.longitude[index],
      layer.typedGeoClusters.latitude[index],
      viewport.bounds,
      canvas.width,
      canvas.height,
    );
    const radius = Math.max(4, Math.sqrt(layer.typedGeoClusters.pointCount[index]) * 4);

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function createCityPoints(): VizGeoPoint[] {
  return [
    [-122.42, 37.77, "San Francisco"],
    [-118.24, 34.05, "Los Angeles"],
    [-87.62, 41.88, "Chicago"],
    [-74.0, 40.71, "New York"],
    [-71.06, 42.36, "Boston"],
    [-95.36, 29.76, "Houston"],
    [-104.99, 39.74, "Denver"],
    [-122.33, 47.61, "Seattle"],
  ].flatMap(([longitude, latitude, label]) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: `${label}-${index}`,
      label: String(label),
      latitude: Number(latitude) + (index % 4) * 0.08,
      longitude: Number(longitude) + Math.floor(index / 4) * 0.08,
    })),
  );
}

function project(
  longitude: number,
  latitude: number,
  bounds: [number, number, number, number],
  width: number,
  height: number,
) {
  const [west, south, east, north] = bounds;

  return [
    ((longitude - west) / (east - west)) * width,
    height - ((latitude - south) / (north - south)) * height,
  ] as const;
}
