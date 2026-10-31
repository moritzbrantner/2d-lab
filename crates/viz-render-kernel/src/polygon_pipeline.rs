//! Target-independent core of the custom immediate WebGPU path: the convex polygon pipeline and
//! the one render pass that draws a triangulated frame. The browser renderer (`webgpu.rs`) draws
//! into a canvas surface; the oracle (`oracle/`) draws into an offscreen texture with the same code.

pub const GPU_VERTEX_SIZE: u64 = 24;

const POLYGON_SHADER: &str = r#"
struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(input.position, 0.0, 1.0);
  output.color = input.color;
  return output;
}

fn srgb_to_linear(value: f32) -> f32 {
  if value <= 0.04045 {
    return value / 12.92;
  }
  return pow((value + 0.055) / 1.055, 2.4);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let linear = vec3<f32>(
    srgb_to_linear(input.color.r),
    srgb_to_linear(input.color.g),
    srgb_to_linear(input.color.b)
  );
  return vec4<f32>(linear * input.color.a, input.color.a);
}
"#;

/// Creates the convex polygon pipeline for an sRGB-encoding `format` view.
pub fn create_polygon_pipeline(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("2d-lab polygon shader"),
        source: wgpu::ShaderSource::Wgsl(POLYGON_SHADER.into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("2d-lab polygon pipeline layout"),
        bind_group_layouts: &[],
        immediate_size: 0,
    });
    let attributes = [
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x2,
            offset: 0,
            shader_location: 0,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 8,
            shader_location: 1,
        },
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
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
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
    })
}

pub fn create_vertex_buffer(device: &wgpu::Device, size: u64) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("2d-lab convex polygon vertices"),
        size,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

pub fn vertex_bytes(vertices: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(vertices));
    for value in vertices {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

/// Clears `view` to the sRGB `background` and draws `vertex_count` triangulated vertices from the
/// first `byte_len` bytes of `vertex_buffer`. Returns the number of draw calls recorded.
#[allow(clippy::too_many_arguments)]
pub fn encode_polygon_pass(
    encoder: &mut wgpu::CommandEncoder,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    vertex_buffer: &wgpu::Buffer,
    byte_len: u64,
    vertex_count: u32,
    background: &[f32],
) -> u32 {
    let color_attachments = [Some(wgpu::RenderPassColorAttachment {
        view,
        depth_slice: None,
        resolve_target: None,
        ops: wgpu::Operations {
            load: wgpu::LoadOp::Clear(wgpu::Color {
                r: srgb_to_linear(background[0]) as f64,
                g: srgb_to_linear(background[1]) as f64,
                b: srgb_to_linear(background[2]) as f64,
                a: background[3] as f64,
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
    if vertex_count == 0 {
        return 0;
    }
    pass.set_pipeline(pipeline);
    pass.set_vertex_buffer(0, vertex_buffer.slice(..byte_len));
    pass.draw(0..vertex_count, 0..1);
    1
}

pub fn srgb_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}
