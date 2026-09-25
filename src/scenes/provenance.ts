export type WorkloadProvenance = {
  readonly kind: "lab-synthetic" | "consumer-shaped";
  readonly sourceRepository?: string;
  readonly sourceRevision?: string;
  readonly sourcePath?: string;
  readonly sourceIdentity?: string;
  readonly note: string;
};

export const workloadProvenance: Readonly<Record<string, WorkloadProvenance>> = {
  "retained-map": {
    kind: "consumer-shaped",
    sourceRepository: "moritzbrantner/maps",
    sourceRevision: "b64b31067e4384fea361ae1de1e79881441e7ff8",
    sourcePath: "docs/engine-scenarios.md",
    sourceIdentity: "camera-world-pan-v1",
    note:
      "Workload intent follows the canonical Maps camera journey and retained-rendering questions. Geometry remains lab-owned synthetic data; Maps keeps geographic camera and projection authority.",
  },
  "maps-e2e-style": {
    kind: "consumer-shaped",
    sourceRepository: "moritzbrantner/maps",
    sourceRevision: "0ac63eed510f23d436909dbfb22528c6414bcde9",
    sourcePath: "demo/data/map-style.ts#e2eMapStyle",
    sourceIdentity: "maps-2d-lab-screen-frame/v1",
    note:
      "Maps owns projection and style semantics. This checked-in screen-space export is a disposable lab fixture; 2d-lab only lowers its resolved primitives into the lab display list.",
  },
  "map-like": {
    kind: "consumer-shaped",
    sourceRepository: "moritzbrantner/maps",
    sourceRevision: "b64b31067e4384fea361ae1de1e79881441e7ff8",
    sourcePath: "docs/engine-scenarios.md",
    sourceIdentity: "geometry-edit-dense-v1",
    note:
      "Mixed polygons and strokes are shaped by Maps' dense geometry workload family without importing map-domain models into the lab.",
  },
  "vector-animation": {
    kind: "consumer-shaped",
    sourceRepository: "moritzbrantner/flat-stories",
    sourceRevision: "c69971965d06b5efb940c3932bfd6b07b1070aca",
    sourcePath: "features/editor/rendering/benchmarkFixture.ts",
    sourceIdentity: "Nova renderer benchmark fixture",
    note:
      "The redraw pressure and independent transforms are shaped by Flat Stories' renderer benchmark. The lab does not import EditorDocument, rig, animation, or scene authority.",
  },
  "filled-polygons": {
    kind: "lab-synthetic",
    note:
      "A deliberately minimal common denominator for Canvas, Vello, and custom Rust/WASM + wgpu comparison.",
  },
};
