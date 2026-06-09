# Viz Engine Benchmarks

This directory contains repeatable data-kernel benchmarks for `@moritzbrantner/viz-engine`.
It compares the engine against libraries that perform similar data work, not full chart renderers.

## What Is Measured

- XY index construction
- XY binned series, histograms, heatmaps, and rolling series
- Full cartesian `computeFrame` calls with binned, histogram, heatmap, and rolling layers
- Object and typed-array `computeFrame` frame formats
- Geo viewport clustering and heat feature generation
- Finance OHLCV downsampling and return series
- Table index construction, filtering, searching, sorting, windowing, and table `computeFrame` materialization
- Rust/WASM density index construction, first query, and warm query costs

## What Is Not Measured

- SVG, Canvas, WebGL, or WebGPU rendering
- React hook lifecycle overhead
- Full chart libraries such as ECharts, uPlot, Recharts, or Chart.js
- Real market/map datasets
- CI pass/fail performance gates

## Commands

Run a short local sanity benchmark:

```sh
bun run bench:quick
```

Run the full Bun benchmark:

```sh
bun run bench:node
```

Run only table benchmarks:

```sh
bun run bench/run.ts --runtime bun --category table
bun run bench/run.ts --runtime bun --quick --category table
```

Run only supported table adoption workloads:

```sh
bun run bench:table:supported
bun run bench/run.ts --runtime bun --quick --category table --workload table/query/numeric-filter --workload table/query/boolean-filter --workload table/query/numeric-sort --workload table/query/boolean-sort --workload table/query/combined-numeric
```

Summarize the latest Bun table benchmark result:

```sh
bun run bench:table:summary
```

Run the browser benchmark in Chromium through Playwright:

```sh
bun run bench:browser
```

Regenerate the Markdown report from the latest JSON files:

```sh
bun run bench:report
```

Results are written to `bench/results/*.json`, and the latest human-readable report is written to
`bench/results/latest.md`. Generated result files are ignored by Git except for `.gitkeep`.

## Interpreting Results

Lower latency is better. Each result records mean, p50, p75, p95, p99, ops/sec, relative latency, sample count, and memory delta when the runtime exposes memory data.

Relative values use `viz-engine js` as the baseline when it exists for a workload. If there is no `viz-engine js` row, the report uses the fastest external implementation, then the fastest implementation in the group.

## Table WASM Adoption Gates

Table WASM adoption is gated by measured benchmark thresholds:

- At `10_000` rows, every experimental WASM table workload must be no worse than `1.10x` JS mean latency.
- At `100_000` or more rows, at least one of `table/query/numeric-filter`, `table/query/numeric-sort`, or `table/query/combined-numeric` must be `0.87x` JS mean latency or better.

Current decision: table WASM is adopted for supported numeric/date/boolean columnar datasets selected by `backend: "wasm"` or by `backend: "auto"` at `>= 10_000` rows. Explicit `backend: "wasm"` can also use the ASCII string kernels when the query is supported. The broad quick run from `2026-06-09T19:18:28.459Z` completed and passed the `10_000`-row small gate for all experimental table workloads. The targeted full supported table run from `2026-06-09T19:13:03.681Z` included `10_000`, `100_000`, and `1_000_000` rows for the numeric/boolean/date adoption workloads and reported `adoption-ready: yes` in `bench:table:summary`; for example, `table/query/numeric-sort` measured `0.061x`, `0.015x`, and `0.013x` relative WASM latency across those sizes. The targeted supported table workloads passed adoption on `2026-06-09T19:13:03.681Z`.

Full all-table benchmarks can still be blocked by JS-owned workloads. Use `bench:table:supported` to measure the numeric/boolean/date workloads that gate backend adoption before attempting the full table suite.

## Semantic Caveats

- `d3-array` is used as an XY aggregation baseline. The adapters normalize output shape, but D3 binning semantics are not identical to `viz-engine` for every edge case.
- `supercluster` is a geospatial clustering baseline. It uses a different KD-tree/tile clustering strategy than the current `viz-engine` grid clustering.
- Geo cluster aggregation defaults to the fast mapping path. Expansion zoom and cluster metric materialization are opt-in through aggregation options when callers need rich cluster metadata.
- Sparse heatmap object output is measured as a production workload for populated-cell rendering and is gated against the older sparse variant row.
- `downsample` is a visual close-price downsampler. It does not preserve OHLC semantics, so the suite also includes a local OHLC aggregation baseline.
- Geo and finance WASM cases use `@mb-rust/geo-viz-wasm` and `@mb-rust/finance-data-wasm`; JS rows remain as fallback and parity baselines.
- Table benchmarks include JS rows for all table workloads and experimental WASM rows for numeric/boolean/date query workloads. They also include experimental ASCII-only Rust string filter/search rows. Non-ASCII strings, locale-sensitive string behavior, string sort, JSON/unknown columns, and object row hydration remain JS-owned.
- Build the finance and geo WASM npm packages sequentially before browser benchmarking. Running two `wasm-pack` builds at once can race in `wasm-opt` output files.
- WASM startup cases run in one process, so module import is not isolated for every iteration. The suite separates construction, first-query, and warm-query costs.
- Typed frame cases measure the typed-array render path. They are the preferred signal for high-frequency WASM-backed cartesian rendering because they avoid object hydration.
- Shifting viewport frame cases use viewport-derived layer domains, so they measure recomputation instead of same-domain cache hits.

## Fixture Data

Fixtures are synthetic and deterministic:

- XY data combines trend, seasonality, noise, spikes, metrics, and controlled x-disorder.
- Geo data mixes clustered city points, outliers, metrics, and antimeridian viewport coverage.
- Finance data is a valid OHLCV random walk with adjusted close values and market-regime properties.
- Table data includes stable row IDs, skewed categories and regions, repeated strings, nullable numeric values, booleans, JSON metadata, and mixed numeric distributions.

The seed is defined in `bench/config.ts`.
