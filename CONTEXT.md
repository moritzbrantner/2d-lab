# Viz Engine

Viz Engine is a data/frame engine for preparing renderer-neutral visualization frames from shared datasets, layers, indexes, and viewports. It exists to keep data preparation, backend selection, and frame contracts separate from visual rendering.

## Language

**Data/Frame Engine**:
A package that turns registered source data and layer intent into renderer-facing frame snapshots.
_Avoid_: chart renderer, chart library, visualization runtime, compute kernel package

**Engine**:
A stateful workspace for one rendering workflow. It owns datasets, layers, indexes, caches, recent frame state, and disposable resources.
_Avoid_: application store, stateless compiler

**Dataset**:
Source data registered with an engine. A dataset does not own display/query intent.
_Avoid_: layer data, view data

**Layer**:
A renderer-needed projection, query, or aggregation over one dataset.
_Avoid_: visual layer, chart series when referring to the engine concept

**Frame**:
An immutable renderer-facing snapshot for one viewport and selected layers. A frame may include stats and diagnostics but not visual UI state.
_Avoid_: scene graph, render model

**Typed Frame**:
The canonical frame format for render workloads.
_Avoid_: compact frame

**Object Frame**:
An inspection and adapter format for debugging, hydration, and migration.
_Avoid_: primary frame

**Viewport**:
The visible data window requested by a renderer, such as cartesian domains, geo bounds/zoom, or table row windows.
_Avoid_: interaction state

**Renderer**:
A consumer of frames that owns visual presentation, formatting, drawing, DOM/Canvas/WebGL work, selection UI, and virtualization.
_Avoid_: engine renderer

**Backend**:
A public execution strategy for frame computation that must preserve the same frame semantics.
_Avoid_: performance guarantee

**Index**:
Engine-owned prepared data for a dataset that enables repeated frame computation.
_Avoid_: frame cache

**Hit Test**:
A data lookup from pointer/viewport coordinates to frame or source-data candidates.
_Avoid_: hover state, selection behavior

**Diagnostic**:
A recoverable explanation attached to a returned frame.
_Avoid_: error

**Error**:
An unrecoverable API or runtime failure that prevents the requested operation.
_Avoid_: diagnostic

**Table Domain**:
A frameable data domain for renderer-neutral row and column frames.
_Avoid_: grid UI, table editor

**Finance Domain**:
Renderer-ready transforms for OHLCV, downsampled price data, and returns.
_Avoid_: market-data core, finance analytics layer

**Geo Domain**:
Viewport-ready frames for geo points, clusters, heat, scalar fields, GeoJSON, and flows.
_Avoid_: map runtime

**XY Domain**:
Cartesian frame transforms for x/y data, bins, histograms, heatmaps, rolling series, and hit-testable data.
_Avoid_: chart semantics

**React Bindings**:
Lifecycle bindings for engine usage in React. They do not render visuals.
_Avoid_: React renderer

**Benchmark**:
A data-kernel performance measurement for index/query/frame-prep workloads.
_Avoid_: full visualization benchmark
