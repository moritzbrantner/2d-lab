# Rendering Lab Roadmap

The roadmap is evidence-driven. A later renderer is not promoted merely because it is more sophisticated.

## 1. Reset and reference boundary

- [x] Remove the former generic dataset/layer/frame engine.
- [x] Establish a low-level path display list with affine transforms and paint.
- [x] Add deterministic Canvas 2D reference paths.
- [x] Add batched Rust/WASM affine preparation.
- [x] Keep product/domain authority outside this repository.

## 2. Custom Rust/WASM + wgpu baseline

- [x] Add immediate Rust/WASM rendering through `wgpu`/WebGPU for closed convex solid polygons.
- [x] Track preparation, upload, submit, draw count, generated vertices and bytes.
- [x] Preserve sRGB color semantics.
- [x] Fail closed for unsupported strokes, concavity and debug overlays.
- [ ] Add GPU timestamp-query evidence where browser/device support makes it reliable.
- [ ] Evaluate MSAA/edge antialiasing against the Canvas reference.

## 3. Map-specific retained geometry

- [x] Add a map-shaped workload with static local geometry and one changing pan/zoom transform.
- [x] Add a retained Rust/WASM + `wgpu` backend.
- [x] Keep triangulated geometry resident and upload only a frame uniform in steady state.
- [x] Verify geometry values before reuse rather than assuming identity means immutability.
- [ ] Let a future Maps adapter supply an authoritative geometry revision and measure the removed scan cost.
- [ ] Add tile-level independent invalidation rather than one monolithic retained buffer.
- [ ] Add map-specific line/stroke geometry and compare retained road buffers.
- [ ] Add culling/visible-tile updates.
- [ ] Add GPU picking only when a Maps workload needs it.

## 4. Vello comparison

- [x] Pin one exact upstream Vello GPU revision for reproducible experiments.
- [x] Adapt the same low-level path list into Vello without making Vello state authoritative.
- [x] Support current fill/stroke workloads through Vello.
- [x] Add Vello to the compatible-renderer benchmark.
- [x] Treat internal Vello draw/upload metrics as unavailable rather than fabricating equivalents.
- [ ] Add Vello CPU as a software-rendering/fallback comparison if that decision becomes relevant.
- [ ] Revisit the git pin when Vello GPU has an appropriate published release.

## 5. Three-engine decision baseline

- [x] Keep Canvas 2D as the readable browser reference.
- [x] Keep pinned Vello as the mature general-vector comparison.
- [x] Keep a visible 2d-lab custom contender on every workload.
- [x] Select retained or immediate custom WebGPU only when that backend preserves the workload semantics.
- [x] Report unsupported custom semantics as coverage evidence instead of silently approximating or omitting the custom contender.
- [ ] Track coverage over time so custom features are added only when a representative workload justifies them.

## 6. Shared evidence and repository setup

- [x] Declare deterministic capabilities through `.coding-tooling.json`.
- [x] Reuse `reusable-workflows` for Pages deployment.
- [x] Reuse `github-pages-template` for shared stats/evidence presentation.
- [x] Publish each Pages use case as its own static route with lazy workload loading and isolated three-engine measurements.
- [x] Declare coding-tooling and runtime/Moonlight evidence sources on Pages.
- [x] Pin consumer-shaped workload provenance to exact Maps and Flat Stories revisions.
- [ ] Add a runtime-profiler scenario only once CI/manual capture can exercise representative browser/WebGPU behavior rather than measuring a test runner or fallback path.
- [ ] Publish normalized `project-evidence-v1` runtime/Moonlight evidence after that scenario is stable.

## 7. Product-shaped evidence

- [x] Add a retained-map workload that tests the main custom-renderer hypothesis.
- [x] Formalize the animated figure scene as the Flat Stories-style redraw workload.
- [ ] Import a representative Maps-derived fixture through a disposable adapter.
- [ ] Import the Flat Stories Nova fixture through a disposable adapter.
- [ ] Preserve each product's own reference renderer as the semantic oracle.
- [ ] Add screenshot/pixel-difference evidence where rasterizer differences make exact pixels inappropriate.

## 8. General vector features

Do not implement these merely to make the custom renderer look complete.

- [ ] Curves.
- [ ] General fill tessellation.
- [ ] Strokes/joins/caps/dashes.
- [ ] Text.
- [ ] Clipping and opacity groups.
- [ ] Images and gradients.

For each item, first ask whether Vello or another specialized library already solves the generic problem well enough. Implement custom machinery only when a product-specific benchmark demonstrates leverage.

## 9. Decision criteria

For **Maps**, keep custom GPU work only where domain structure produces an end-to-end advantage such as retained tile geometry, cheaper camera-only frames, map-specific culling, picking or specialized shaders.

For **Flat Stories**, prefer Vello if representative vector scenes meet correctness, browser compatibility, bundle/startup and frame-time requirements. Flat Stories should not grow a general renderer simply because a custom map pipeline exists elsewhere.

A rendering primitive moves into a stable shared package only after multiple real consumers demonstrate the same semantic contract.


## 10. Promotion gate

`2d-lab` remains a lab until a separate promotion decision is justified.

A shared 2D rendering contract must not be extracted merely because the lab has a useful display list. Promotion requires all of the following:

- at least two real product consumers need materially the same rendering semantics;
- each product keeps its canonical scene/document/map model and owns its adapter;
- the candidate contract contains no map, editor, story, chart, or other product semantics;
- each product's existing reference renderer remains the correctness oracle during adoption;
- representative product-shaped benchmarks show a concrete reason to share the implementation rather than simply share ideas;
- the promoted package receives a production-oriented name and ownership boundary instead of making `2d-lab` itself the authority.

Until that gate is met, reusable findings move outward as techniques, benchmark evidence, or deliberately copied small algorithms—not as a universal scene model.
