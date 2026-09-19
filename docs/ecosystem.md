# Ecosystem integration

2d-lab is a rendering decision laboratory. It should reuse shared infrastructure and evidence contracts while keeping rendering experiments and benchmark meaning local.

## Active integrations

| Project | 2d-lab use | Boundary |
| --- | --- | --- |
| `reusable-workflows` | GitHub Pages deployment through the pinned reusable `deploy-pages.yml` workflow. | Owns deployment mechanics and artifact transport only; it does not define renderer validation or benchmark meaning. |
| `github-pages-template` | Augments the lab build with shared `/stats/` and `/evidence/` routes. | Owns shared presentation only. The root rendering lab remains repository-owned. |
| `coding-tooling` | Discovers the declared typecheck/build/unit/benchmark-smoke capabilities from `.coding-tooling.json`; its analysis is exposed on Pages. | Owns deterministic capability discovery/invocation, not benchmark thresholds or renderer semantics. |
| `runtime-profiler` | Authority for future immutable runtime captures. The Pages source is declared now and fails closed until representative evidence is published. | Do not substitute shared-runner wall clock measurements for GPU runtime evidence. A runtime scenario should be added only when the capture environment can exercise the same browser/WebGPU path credibly. |
| `moonlight` | Authority for future baseline/candidate evaluation of comparable runtime-profiler bundles. | 2d-lab owns workload identity; Moonlight owns evaluation records/policy. No implicit performance verdicts are embedded in the lab. |
| `maps` | Source of canonical workload intent for map-oriented experiments. Current provenance is pinned to `b64b31067e4384fea361ae1de1e79881441e7ff8`. | Maps keeps camera, projection, tile, style, interaction, and render-planning authority. Lab scenes are disposable adapters or synthetic approximations, never Maps runtime contracts. |
| `flat-stories` | Source of canonical vector-animation/renderer workload intent. Current provenance is pinned to `c69971965d06b5efb940c3932bfd6b07b1070aca`. | Flat Stories keeps `EditorDocument`, rig, animation, path, and editor scene authority. 2d-lab must not import those models as its scene graph. |

## Deliberately not coupled

### settings

The lab's renderer, scene, animation, and debug controls are transient experiment state rather than durable user preferences. A direct `settings` dependency would currently add a second concern without improving renderer evidence. Shared Pages preferences are consumed through `github-pages-template`, which already respects the settings authority boundary.

If the lab later gains durable preferences such as persistent accessibility or appearance choices, reuse `settings` rather than inventing a local preference model.

### rust-kernels

No current `rust-kernels` component matches the renderer-specific affine batching, convex polygon preparation, or GPU-resource responsibilities used here. Keep those experiments local until a genuinely domain-neutral kernel is proven by multiple consumers. If such a kernel appears, consume it from Rust rather than duplicating it.

### 3d-lab

2d-lab has no 3D mesh, 3D camera, animation, or spatial-authority requirement. Do not create a dependency merely because both repositories use GPU rendering.

### asset-tooling

Current benchmark scenes are generated deterministic geometry and contain no authored asset pipeline. When representative product fixtures begin carrying generated/static assets, use `asset-tooling` for provenance and reproducibility instead of adding lab-specific asset processing.

## Product fixture rule

Consumer-shaped workloads must declare:

- the source repository;
- an exact source revision;
- the authoritative source path/scenario identity;
- whether the lab data is copied, normalized, or merely shaped by that source;
- a note stating which product semantics remain outside 2d-lab.

The source pin is provenance, not a source dependency. Normal CI and Pages builds must not require sibling checkouts of Maps or Flat Stories.

## Evidence rule

The stable evidence flow is:

```text
repository-owned workload + semantic checks
             |
             +--> coding-tooling capability discovery
             |
             +--> runtime-profiler capture (when representative)
                         |
                         +--> Moonlight evaluation (when comparable)
                                     |
                                     +--> project-evidence-v1
                                                  |
                                                  +--> github-pages-template
                                                               |
                                                               +--> reusable-workflows deployment
```

Performance evidence is advisory until a repository-owned policy deliberately makes a specific comparable evaluation blocking.
