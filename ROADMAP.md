# Rendering Lab Roadmap

The roadmap is evidence-driven. A later renderer is not promoted merely because it is more sophisticated.

## 1. Reset and reference boundary

- [x] Remove the former generic dataset/layer/frame engine.
- [x] Establish a low-level path display list with affine transforms and paint.
- [x] Add a deterministic Canvas 2D reference renderer.
- [x] Add one-batch Rust/WASM geometry transformation.
- [x] Add map-like and vector-animation fixtures.
- [x] Add browser benchmark and debug-bounds controls.
- [x] Keep product/domain authority outside this repository.

## 2. WebGPU baseline

- [x] Add the first wgpu/WebGPU backend for closed convex solid polygons.
- [ ] Add stroked polyline tessellation without changing display-list semantics.
- [x] Keep the display-list input identical where semantics overlap.
- [x] Record CPU prepare, upload-call, submit/present and end-to-end frame timings separately.
- [x] Track draw calls, generated vertices and bytes uploaded per frame.
- [x] Add a fill-only parity workload supported by both Canvas and WebGPU.
- [ ] Add GPU timestamp-query evidence where browser/device support makes it reliable.
- [ ] Exercise static geometry reuse versus per-frame rebuilds.

## 3. Vector tessellation

- [ ] Add curves to the display-list test vocabulary.
- [ ] Evaluate lyon tessellation in Rust.
- [ ] Replace the convex-only triangle fan with measured general-path tessellation where required.
- [ ] Separate path preparation/tessellation from GPU submission.
- [ ] Cache immutable geometry and measure invalidation cost.
- [ ] Compare CPU tessellation against any GPU-oriented alternative that is practical on the web.

## 4. Real product-shaped fixtures

- [ ] Add an adapter fixture derived from a representative Maps scene.
- [ ] Add an adapter fixture derived from the Flat Stories renderer lab.
- [ ] Keep those adapters disposable: no product domain types in the rendering core.
- [ ] Preserve each product's own reference renderer as the semantic oracle.

## 5. Text and symbols

- [ ] Measure Canvas text separately from GPU text.
- [ ] Evaluate glyphon/cosmic-text for shaping and atlas-backed GPU rendering.
- [ ] Add map-label workloads with many repeated glyphs.
- [ ] Add vector-editor text workloads with transforms and opacity.

## 6. Clipping, compositing and images

- [ ] Nested clips.
- [ ] Opacity groups.
- [ ] Image/icon atlases.
- [ ] Blend modes required by real consumers.
- [ ] Explicit overdraw/debug visualization.

## 7. Promotion criteria

A renderer primitive can move into a stable shared package only after at least two independent consumers need the same semantics.

A backend can become a production recommendation only after deterministic correctness checks pass, representative product-shaped fixtures exist, the improvement is visible in end-to-end browser evidence rather than only a microbenchmark, and startup cost, memory, and bundle/WASM size remain acceptable.
