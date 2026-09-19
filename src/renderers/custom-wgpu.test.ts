import { describe, expect, it } from "vitest";

import type { DisplayList } from "../core/display-list";
import {
  customWgpuRenderer,
  resolveCustomWgpuBackend,
} from "./custom-wgpu";

function scene(
  options: {
    readonly secondTransform?: boolean;
    readonly stroke?: boolean;
  } = {},
): DisplayList {
  return {
    width: 100,
    height: 100,
    background: "#ffffff",
    commands: [
      {
        kind: "path",
        points: new Float32Array([0, 0, 20, 0, 20, 20, 0, 20]),
        closed: true,
        transform: [1, 0, 0, 1, 5, 7],
        paint: {
          fill: "#336699",
          ...(options.stroke ? { stroke: "#112233" } : {}),
        },
      },
      {
        kind: "path",
        points: new Float32Array([30, 0, 50, 0, 50, 20, 30, 20]),
        closed: true,
        transform: options.secondTransform
          ? [1, 0, 0, 1, 6, 7]
          : [1, 0, 0, 1, 5, 7],
        paint: { fill: "#996633" },
      },
    ],
  };
}

describe("2d-lab custom renderer boundary", () => {
  it("presents one explicit Rust/WASM + wgpu renderer", () => {
    expect(customWgpuRenderer.id).toBe("custom-rust-wasm-wgpu");
    expect(customWgpuRenderer.name).toMatch(/Rust\/WASM \+ wgpu/);
  });

  it("uses retained wgpu when one shared transform preserves the workload", () => {
    const resolved = resolveCustomWgpuBackend(scene(), {
      debugBounds: false,
    });

    expect(typeof resolved).not.toBe("string");
    if (typeof resolved !== "string") {
      expect(resolved.id).toBe("retained");
      expect(resolved.renderer.id).toBe("wgpu-retained-map");
    }
  });

  it("falls back only to the immediate Rust/WASM wgpu path", () => {
    const resolved = resolveCustomWgpuBackend(scene({ secondTransform: true }), {
      debugBounds: false,
    });

    expect(typeof resolved).not.toBe("string");
    if (typeof resolved !== "string") {
      expect(resolved.id).toBe("immediate");
      expect(resolved.renderer.id).toBe("wgpu-rust-polygons");
    }
  });

  it("fails closed instead of falling back to Canvas for unsupported semantics", () => {
    const resolved = resolveCustomWgpuBackend(scene({ stroke: true }), {
      debugBounds: false,
    });

    expect(resolved).toMatch(/No Rust\/WASM \+ wgpu custom backend/);
    expect(customWgpuRenderer.support(scene({ stroke: true }), {
      debugBounds: false,
    })).toMatch(/No Rust\/WASM \+ wgpu custom backend/);
  });
});
