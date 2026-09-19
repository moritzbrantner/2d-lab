# Agent guidance

This repository is a rendering decision laboratory, not a generic application framework and not a production universal renderer.

## Authority boundaries

- Keep map, chart, table, editor, character, animation and other domain semantics in their owning repositories.
- Accept render-ready primitives rather than importing product models.
- Do not introduce a second authoritative scene graph for a consumer.
- Do not force custom WebGPU and Vello behind one abstraction merely because both draw pixels.
- Product-owned revision/caching knowledge stays with the product; the lab may model it explicitly for experiments.
- Treat `BenchmarkWorkload` and `DisplayList` as lab-internal experiment contracts, not product APIs.
- Products should normally consume findings, not add `2d-lab` as a runtime authority dependency.
- Promote reusable 2D rendering behavior only through a separately named production boundary after at least two real consumers prove the same semantics.

## Experiment discipline

- Correctness comes before timing.
- Use deterministic fixtures and fixed benchmark frame sequences.
- Keep preparation, upload and render/submit timings separate where the backend permits it.
- Mark unavailable backend metrics as unavailable; never invent comparable-looking numbers.
- Never make shared-runner wall-clock timings a correctness gate.
- Add an optimization only with a workload that can demonstrate why it exists.
- Prefer end-to-end evidence over isolated microbenchmarks.
- Keep Canvas 2D, pinned Vello, and the 2d-lab custom contender visible as the stable three-engine decision baseline.
- For the custom contender, report the actual specialized backend used; when no custom backend preserves a workload, keep the row visible and report the semantic coverage gap instead of approximating it.

## Custom renderer rule

Custom rendering is justified by domain-specific leverage, not by the ability to reimplement generic graphics features.

For map-oriented experiments, retained geometry, camera-only updates, culling, picking and specialized shaders are valid hypotheses.

For generic vector capabilities such as curves, strokes, text, clipping, gradients and compositing, test mature libraries before implementing replacements.

## Vello pin

Vello GPU is currently consumed from the exact upstream revision documented in README.md. Keep that pin explicit. Do not silently float the dependency or present the git API as stable.

## Validation

- Canvas remains a readable semantic reference where applicable.
- Unsupported renderer semantics must fail closed.
- Keep the Vello adapter non-authoritative.
- Keep exact-head Rust/WASM/browser evidence separate from noisy performance evidence.
