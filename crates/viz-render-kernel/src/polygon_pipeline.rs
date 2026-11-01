//! Target-independent core of the custom immediate WebGPU path: the anti-aliased convex polygon
//! pipeline and the one render pass that draws a frame's `CoveragePolygons`. The browser renderer
//! (`webgpu.rs`) draws into a canvas surface; the oracle (`oracle/`) draws into an offscreen
//! texture with the same code.
//!
//! Anti-aliasing is analytic: every fragment of a polygon's grown triangle fan computes the
//! box-filter area of its pixel inside the polygon's anti-aliased edges (exact for one crossing
//! edge, and for two unless they meet inside the pixel; more multiply). Curved and concave fills
//! and strokes arrive as convex pieces of a lyon mesh whose shared internal edges are hard
//! pixel-centre tests instead, so adjacent pieces split their pixels without a seam or a double
//! blend. Like Vello and
//! Skia, colours are blended as sRGB-encoded values into a non-sRGB target, so a half-covered
//! edge pixel is the sRGB midpoint of the two colours.

use crate::{CoveragePolygons, GPU_VERTEX_FLOATS};

const GPU_VERTEX_SIZE: u64 = (GPU_VERTEX_FLOATS * 4) as u64;
const INITIAL_BUFFER_SIZE: u64 = 4 * 1024;

const POLYGON_SHADER: &str = r#"
struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) edges: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) @interpolate(flat) edges: vec2<u32>,
};

// Per edge: unit inward normal, offset (signed pixel distance = dot(n, p) + offset), then 0 for
// an anti-aliased outline edge or 1 for a hard internal edge.
@group(0) @binding(0) var<storage, read> edges: array<vec4<f32>>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(input.position, 0.0, 1.0);
  output.color = input.color;
  output.edges = vec2<u32>(input.edges);
  return output;
}

// Area of the unit pixel square centred `d` pixels inside a line with unit normal `n`: the CDF of
// n·q for q uniform over the square (a trapezoid of width |nx| + |ny|).
fn edge_coverage(n: vec2<f32>, d: f32) -> f32 {
  let a = max(abs(n.x), abs(n.y));
  let b = min(abs(n.x), abs(n.y));
  let t = d + 0.5 * (a + b);
  if t <= 0.0 {
    return 0.0;
  }
  if t >= a + b {
    return 1.0;
  }
  if t < b {
    return t * t / (2.0 * a * b);
  }
  if t <= a {
    return (t - 0.5 * b) / a;
  }
  let u = a + b - t;
  return 1.0 - u * u / (2.0 * a * b);
}

// Half the extent of the unit pixel square along unit normal `n`.
fn half_extent(n: vec2<f32>) -> f32 {
  return 0.5 * (abs(n.x) + abs(n.y));
}

// Midpoint of the chord that line `l` (unit normal, signed distance of the pixel centre) cuts
// through the unit pixel square, relative to the pixel centre.
fn chord_midpoint(l: vec3<f32>) -> vec2<f32> {
  let p0 = -l.z * l.xy;
  let dir = vec2<f32>(l.y, -l.x);
  var t0 = -2.0;
  var t1 = 2.0;
  if abs(dir.x) > 1.0e-6 {
    let a = (-0.5 - p0.x) / dir.x;
    let b = (0.5 - p0.x) / dir.x;
    t0 = max(t0, min(a, b));
    t1 = min(t1, max(a, b));
  }
  if abs(dir.y) > 1.0e-6 {
    let a = (-0.5 - p0.y) / dir.y;
    let b = (0.5 - p0.y) / dir.y;
    t0 = max(t0, min(a, b));
    t1 = min(t1, max(a, b));
  }
  return p0 + 0.5 * (t0 + t1) * dir;
}

// Area of the unit pixel square inside two crossing edges `a` and `b`. Where the edges do not
// meet inside the pixel it is exact: within the pixel one half-plane contains the other (the
// smaller coverage), they are disjoint (0), or they cover it together (the sum minus 1). Where
// they meet inside, it blends the product (exact for perpendicular axis-aligned edges) towards
// the minimum (exact as the edges straighten into one line, as at a flattened curve's vertex).
fn pair_coverage(a: vec3<f32>, b: vec3<f32>) -> f32 {
  let ca = edge_coverage(a.xy, a.z);
  let cb = edge_coverage(b.xy, b.z);
  let alignment = dot(a.xy, b.xy);
  let det = a.x * b.y - a.y * b.x;
  if abs(det) > 1.0e-6 {
    let meet = vec2<f32>(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z) / det;
    if all(abs(meet) < vec2<f32>(0.5)) {
      return mix(ca * cb, min(ca, cb), clamp(alignment, 0.0, 1.0));
    }
  } else if alignment > 0.0 {
    return min(ca, cb); // Parallel, facing the same way.
  }
  let a_in_b = dot(b.xy, chord_midpoint(a)) + b.z >= 0.0;
  let b_in_a = dot(a.xy, chord_midpoint(b)) + a.z >= 0.0;
  if a_in_b && b_in_a {
    return max(ca + cb - 1.0, 0.0);
  }
  if a_in_b {
    return ca;
  }
  if b_in_a {
    return cb;
  }
  return 0.0;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let p = input.position.xy;
  var crossing = 0u;
  var first = vec3<f32>();
  var second = vec3<f32>();
  // More than two crossing edges (pixels at tiny pieces): their coverages multiply.
  var product = 1.0;
  let end = input.edges.x + input.edges.y;
  for (var i = input.edges.x; i < end; i++) {
    let edge = edges[i];
    let d = dot(edge.xy, p) + edge.z;
    if edge.w == 2.0 {
      continue; // The limit of the hard edge before it, read with that edge.
    }
    if edge.w != 0.0 {
      // Hard internal edge between two pieces of one mesh: the piece across it holds the
      // exactly negated line, so a pixel centre belongs to exactly one side (ties go to the
      // side whose normal points to +x, then +y).
      let tie = edge.x > 0.0 || (edge.x == 0.0 && edge.y > 0.0);
      if d < 0.0 || (d == 0.0 && !tie) {
        // Unless a limit record follows and the pixel centre is past it.
        if i + 1u >= end {
          discard;
        }
        let limit = edges[i + 1u];
        if limit.w != 2.0 || dot(limit.xy, p) + limit.z <= 0.0 {
          discard;
        }
      }
    } else {
      let h = half_extent(edge.xy);
      if d <= -h {
        discard;
      }
      if d < h {
        if crossing == 0u {
          first = vec3<f32>(edge.xy, d);
        } else if crossing == 1u {
          second = vec3<f32>(edge.xy, d);
        }
        crossing++;
        product *= edge_coverage(edge.xy, d);
      }
    }
  }
  var coverage = product;
  if crossing == 2u {
    coverage = pair_coverage(first, second);
  }
  if coverage <= 0.0 {
    discard;
  }
  let alpha = input.color.a * coverage;
  return vec4<f32>(input.color.rgb * alpha, alpha);
}
"#;

/// The custom immediate path's GPU state: pipeline plus growable vertex and edge buffers.
pub struct PolygonRenderer {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    vertices: GrowBuffer,
    edges: GrowBuffer,
    bind_group: wgpu::BindGroup,
    vertex_count: u32,
    vertex_bytes: u64,
}

struct GrowBuffer {
    buffer: wgpu::Buffer,
    capacity: u64,
    label: &'static str,
    usage: wgpu::BufferUsages,
}

impl GrowBuffer {
    fn new(device: &wgpu::Device, label: &'static str, usage: wgpu::BufferUsages) -> Self {
        let usage = usage | wgpu::BufferUsages::COPY_DST;
        Self {
            buffer: create_buffer(device, label, usage, INITIAL_BUFFER_SIZE),
            capacity: INITIAL_BUFFER_SIZE,
            label,
            usage,
        }
    }

    /// Writes `bytes`, reallocating first when they do not fit. Returns whether it reallocated.
    fn write(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, bytes: &[u8]) -> bool {
        let len = bytes.len() as u64;
        let grew = len > self.capacity;
        if grew {
            self.capacity = len.next_power_of_two();
            self.buffer = create_buffer(device, self.label, self.usage, self.capacity);
        }
        if len > 0 {
            queue.write_buffer(&self.buffer, 0, bytes);
        }
        grew
    }
}

impl PolygonRenderer {
    /// Creates the pipeline for a non-sRGB `format` view (`format.remove_srgb_suffix()` of the
    /// surface), which receives sRGB-encoded colour as Vello's target does.
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("2d-lab polygon shader"),
            source: wgpu::ShaderSource::Wgsl(POLYGON_SHADER.into()),
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("2d-lab polygon edges layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("2d-lab polygon pipeline layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let attributes = wgpu::vertex_attr_array![
            0 => Float32x2,
            1 => Float32x4,
            2 => Float32x2,
        ];
        let vertex_buffers = [Some(wgpu::VertexBufferLayout {
            array_stride: GPU_VERTEX_SIZE,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &attributes,
        })];
        let premultiplied = wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        };
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("2d-lab convex polygon pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &vertex_buffers,
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState {
                        color: premultiplied,
                        alpha: premultiplied,
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let vertices = GrowBuffer::new(
            device,
            "2d-lab polygon vertices",
            wgpu::BufferUsages::VERTEX,
        );
        let edges = GrowBuffer::new(device, "2d-lab polygon edges", wgpu::BufferUsages::STORAGE);
        let bind_group = create_bind_group(device, &layout, &edges.buffer);
        Self {
            pipeline,
            layout,
            vertices,
            edges,
            bind_group,
            vertex_count: 0,
            vertex_bytes: 0,
        }
    }

    /// Uploads one frame's geometry. Returns the bytes written.
    pub fn upload(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        geometry: &CoveragePolygons,
    ) -> u64 {
        let vertex_bytes = float_bytes(&geometry.vertices);
        let edge_bytes = float_bytes(&geometry.edges);
        self.vertices.write(device, queue, &vertex_bytes);
        if self.edges.write(device, queue, &edge_bytes) {
            self.bind_group = create_bind_group(device, &self.layout, &self.edges.buffer);
        }
        self.vertex_count = geometry.vertex_count() as u32;
        self.vertex_bytes = vertex_bytes.len() as u64;
        self.vertex_bytes + edge_bytes.len() as u64
    }

    /// Clears `view` to the sRGB `background` and draws the uploaded geometry. Returns the number
    /// of draw calls recorded.
    pub fn encode(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        background: &[f32],
    ) -> u32 {
        let color_attachments = [Some(wgpu::RenderPassColorAttachment {
            view,
            depth_slice: None,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color {
                    r: f64::from(background[0]),
                    g: f64::from(background[1]),
                    b: f64::from(background[2]),
                    a: f64::from(background[3]),
                }),
                store: wgpu::StoreOp::Store,
            },
        })];
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("2d-lab convex polygon render pass"),
            color_attachments: &color_attachments,
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        if self.vertex_count == 0 {
            return 0;
        }
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_vertex_buffer(0, self.vertices.buffer.slice(..self.vertex_bytes));
        pass.draw(0..self.vertex_count, 0..1);
        1
    }
}

fn create_buffer(
    device: &wgpu::Device,
    label: &str,
    usage: wgpu::BufferUsages,
    size: u64,
) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size,
        usage,
        mapped_at_creation: false,
    })
}

fn create_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    edges: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("2d-lab polygon edges"),
        layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: edges.as_entire_binding(),
        }],
    })
}

fn float_bytes(values: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(values));
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}
