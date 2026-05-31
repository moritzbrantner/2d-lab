import { createSupercluster, getSuperclusterViewport } from "../adapters/supercluster";
import { JsVizGeoPointIndex, WasmVizGeoPointIndex } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createGeoFixture } from "../fixtures/geo";
import { assertPositive, createCaseId, createDirectGeoHeatFeatures } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";

export function createGeoCases(config: BenchmarkConfig): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const size of config.geoSizes) {
    const fixture = createGeoFixture(size, config.settings.seed);
    const sizeLabel = formatSize(size);
    const viewports = [
      { name: "world", query: fixture.viewports.world },
      { name: "city", query: fixture.viewports.city },
      { name: "dense", query: fixture.viewports.dense },
      { name: "antimeridian", query: fixture.viewports.antimeridian },
    ] as const;

    cases.push({
      category: "geo",
      id: createCaseId(["geo", "index", sizeLabel, "supercluster"]),
      implementation: "supercluster",
      external: true,
      notes: ["Measures Supercluster load/index construction."],
      prepare: () => null,
      run: () => createSupercluster(fixture.points, { radius: 72 }),
      size: sizeLabel,
      sizeValue: size,
      validate: () => {
        const cluster = createSupercluster(fixture.points, { radius: 72 });
        const output = getSuperclusterViewport(
          cluster,
          fixture.viewports.world.bounds,
          fixture.viewports.world.zoom,
        );
        assertPositive(output.features.length, "supercluster feature count");
      },
      workload: "cluster-index-construction",
    });

    for (const viewport of viewports) {
      for (const implementation of ["js", "wasm-fallback"] as const) {
        cases.push({
          category: "geo",
          id: createCaseId(["geo", "clusters", viewport.name, sizeLabel, implementation]),
          implementation: `viz-engine ${implementation}`,
          notes:
            implementation === "wasm-fallback"
              ? ["Geo WASM class currently delegates to the JS implementation."]
              : [],
          prepare: () =>
            implementation === "js"
              ? new JsVizGeoPointIndex(fixture.points)
              : new WasmVizGeoPointIndex(fixture.points),
          run: (prepared) =>
            (prepared as JsVizGeoPointIndex | WasmVizGeoPointIndex).getViewportAggregation(
              viewport.query,
              { radius: 72 },
            ),
          size: sizeLabel,
          sizeValue: size,
          validate: (prepared) => {
            const output = (
              prepared as JsVizGeoPointIndex | WasmVizGeoPointIndex
            ).getViewportAggregation(viewport.query, { radius: 72 });
            assertPositive(
              output.summary.visibleClusterCount + output.summary.visibleUnclusteredCount,
              "viz-engine geo visible feature count",
            );
            assertPositive(
              output.summary.visiblePointCount,
              "viz-engine geo represented point count",
            );
          },
          workload: `clusters/${viewport.name}`,
        });
      }

      cases.push({
        category: "geo",
        id: createCaseId(["geo", "clusters-fast", viewport.name, sizeLabel, "viz-engine-js"]),
        implementation: "viz-engine js fast",
        prepare: () => new JsVizGeoPointIndex(fixture.points),
        run: (prepared) =>
          (prepared as JsVizGeoPointIndex).getViewportAggregation(viewport.query, {
            fast: true,
            radius: 72,
          }),
        size: sizeLabel,
        sizeValue: size,
        validate: (prepared) => {
          const output = (prepared as JsVizGeoPointIndex).getViewportAggregation(viewport.query, {
            fast: true,
            radius: 72,
          });
          assertPositive(
            output.summary.visibleClusterCount + output.summary.visibleUnclusteredCount,
            "viz-engine fast geo visible feature count",
          );
          assertPositive(
            output.summary.visiblePointCount,
            "viz-engine fast geo represented point count",
          );
        },
        workload: `clusters-fast/${viewport.name}`,
      });

      cases.push({
        category: "geo",
        external: true,
        id: createCaseId(["geo", "clusters", viewport.name, sizeLabel, "supercluster"]),
        implementation: "supercluster",
        notes: [
          "Comparable geospatial clustering workload; Supercluster uses a different KD-tree/tile algorithm.",
        ],
        prepare: () => createSupercluster(fixture.points, { radius: 72 }),
        run: (prepared) =>
          getSuperclusterViewport(
            prepared as ReturnType<typeof createSupercluster>,
            viewport.query.bounds,
            viewport.query.zoom,
          ),
        size: sizeLabel,
        sizeValue: size,
        validate: (prepared) => {
          const output = getSuperclusterViewport(
            prepared as ReturnType<typeof createSupercluster>,
            viewport.query.bounds,
            viewport.query.zoom,
          );
          assertPositive(output.features.length, "supercluster visible feature count");
          assertPositive(output.representedPointCount, "supercluster represented point count");
        },
        workload: `clusters/${viewport.name}`,
      });
    }

    for (const viewport of [viewports[1]!, viewports[2]!]) {
      cases.push({
        category: "geo",
        id: createCaseId(["geo", "heat", viewport.name, sizeLabel, "viz-engine-js"]),
        implementation: "viz-engine js",
        prepare: () => new JsVizGeoPointIndex(fixture.points),
        run: (prepared) =>
          (prepared as JsVizGeoPointIndex).getHeatFeatures(viewport.query, {
            weightMetric: "demand",
          }),
        size: sizeLabel,
        sizeValue: size,
        validate: (prepared) => {
          const output = (prepared as JsVizGeoPointIndex).getHeatFeatures(viewport.query, {
            weightMetric: "demand",
          });
          assertPositive(output.features.length, "viz-engine heat feature count");
        },
        workload: `heat/${viewport.name}`,
      });

      cases.push({
        category: "geo",
        external: true,
        id: createCaseId(["geo", "heat", viewport.name, sizeLabel, "direct-filter-map"]),
        implementation: "direct-filter-map",
        notes: ["Simple direct viewport filter and weight normalization baseline."],
        prepare: () => fixture.points,
        run: () => createDirectGeoHeatFeatures(fixture.points, viewport.query, "demand"),
        size: sizeLabel,
        sizeValue: size,
        validate: () => {
          const output = createDirectGeoHeatFeatures(fixture.points, viewport.query, "demand");
          assertPositive(output.features.length, "direct heat feature count");
        },
        workload: `heat/${viewport.name}`,
      });
    }
  }

  return cases;
}
