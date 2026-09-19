# Agent guidance

This repository is a rendering experiment, not a generic application framework.

## Authority boundaries

- Keep map, chart, table, editor, character, animation and other domain semantics in their owning repositories.
- Accept render-ready primitives rather than importing product models.
- Do not introduce a second authoritative scene graph for a consumer.
- Prefer small backend-neutral rendering primitives only when at least two experiments require the same meaning.

## Experiment discipline

- Correctness comes before timing.
- Use deterministic fixtures and fixed benchmark frame sequences.
- Keep preparation and drawing timings separate when possible.
- Never make shared-runner wall-clock timings a correctness gate.
- Record backend crossings and allocations when they are relevant to the hypothesis.
- Add an optimization only with a workload that can demonstrate why it exists.

## Implementation direction

- Canvas 2D is the initial semantic/performance reference.
- Rust/WASM owns measured numeric or geometry-heavy kernels.
- Browser integration remains TypeScript unless moving it has demonstrated value.
- wgpu/WebGPU, tessellation, text and batching are independent experiments; do not hide them behind a premature universal renderer abstraction.
