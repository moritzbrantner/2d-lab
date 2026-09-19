use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use js_sys::Float64Array;
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

use crate::build_local_convex_polygon_vertices;

const INITIAL_VERTEX_BUFFER_SIZE: u64 = 4 * 1024;
const GPU_VERTEX_SIZE: u64 = 24;
const FRAME_UNIFORM_SIZE: u64 = 32;

const RETAINED_SHADER: &str = r#"
struct FrameUniform {
  affine0: vec4<f32>,
  affine1: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniform;

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

fn srgb_to_linear(value: f32) -> f32 {
  if value <= 0.04045 {
    return value / 12.92;
  }
  return pow((value + 0.055) / 1.055, 2.4);
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let screen_x =
    frame.affine0.x * input.position.x +
    frame.affine0.z * input.position.y +
    frame.affine1.x;
  let screen_y =
    frame.affine0.y * input.position.x +
    frame.affine0.w * input.position.y +
    frame.affine1.y;

  let clip_x = screen_x / frame.affine1.z * 2.0 - 1.0;
  let clip_y = 1.0 - screen_y / frame.affine1.w * 2.0;

  var output: VertexOutput;
  output.position = vec4<f32>(clip_x, clip_y, 0.0, 1.0);
  output.color = input.color;
  return output;
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

#[wasm_bindgen]
pub struct RetainedWgpuPolygonRenderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    surface_view_format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    vertex_capacity: u64,
    vertex_count: u32,
    vertex_bytes: u64,
    frame_uniform_buffer: wgpu::Buffer,
    frame_bind_group: wgpu::BindGroup,
    device_lost: Arc<AtomicBool>,
}

#[wasm_bindgen(js_name = createRetainedWgpuPolygonRenderer)]
pub async fn create_retained_wgpu_polygon_renderer(
    canvas: HtmlCanvasElement,
) -> Result<RetainedWgpuPolygonRenderer, JsValue> {
    RetainedWgpuPolygonRenderer::new(canvas).await
}

#[wasm_bindgen]
impl RetainedWgpuPolygonRenderer {
    async fn new(canvas: HtmlCanvasElement) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::default();
        let surface: wgpu::Surface<'static> = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|error| js_error("could not create retained wgpu canvas surface", error))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| js_error("could not acquire retained wgpu adapter", error))?;
        let capabilities = surface.get_capabilities(&adapter);
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|error| js_error("could not acquire retained wgpu device", error))?;

        let device_lost = Arc::new(AtomicBool::new(false));
        let lost_signal = Arc::clone(&device_lost);
        device.set_device_lost_callback(move |_reason, _message| {
            lost_signal.store(true, Ordering::Release);
        });

        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| JsValue::from_str("retained wgpu surface has no compatible configuration"))?;
        if capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::Opaque)
        {
            config.alpha_mode = wgpu::CompositeAlphaMode::Opaque;
        } else if capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PreMultiplied)
        {
            config.alpha_mode = wgpu::CompositeAlphaMode::PreMultiplied;
        }
        config.present_mode = wgpu::PresentMode::AutoVsync;

        let surface_view_format = config.format.add_srgb_suffix();
        if surface_view_format != config.format {
            config.view_formats = vec![surface_view_format];
        }
        surface.configure(&device, &config);

        let frame_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("viz-engine retained frame layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let frame_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("viz-engine retained frame uniform"),
            size: FRAME_UNIFORM_SIZE,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let frame_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("viz-engine retained frame bind group"),
            layout: &frame_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: frame_uniform_buffer.as_entire_binding(),
            }],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("viz-engine retained polygon shader"),
            source: wgpu::ShaderSource::Wgsl(RETAINED_SHADER.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("viz-engine retained polygon pipeline layout"),
            bind_group_layouts: &[Some(&frame_bind_group_layout)],
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
        let premultiplied_blend = wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
        };
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("viz-engine retained convex polygon pipeline"),
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
                    format: surface_view_format,
                    blend: Some(premultiplied_blend),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let vertex_buffer = create_vertex_buffer(&device, INITIAL_VERTEX_BUFFER_SIZE);

        Ok(Self {
            surface,
            device,
            queue,
            config,
            surface_view_format,
            pipeline,
            vertex_buffer,
            vertex_capacity: INITIAL_VERTEX_BUFFER_SIZE,
            vertex_count: 0,
            vertex_bytes: 0,
            frame_uniform_buffer,
            frame_bind_group,
            device_lost,
        })
    }

    #[wasm_bindgen(js_name = isDeviceLost)]
    pub fn is_device_lost(&self) -> bool {
        self.device_lost.load(Ordering::Acquire)
    }

    #[wasm_bindgen(js_name = uploadGeometry)]
    pub fn upload_geometry(
        &mut self,
        points: &[f32],
        spans: &[u32],
        colors: &[f32],
    ) -> Result<Float64Array, JsValue> {
        let prepare_start = now_ms();
        let vertices = build_local_convex_polygon_vertices(points, spans, colors)
            .map_err(|message| JsValue::from_str(&message))?;
        let vertex_bytes = vertex_bytes(&vertices);
        let prepare_ms = now_ms() - prepare_start;

        let required = vertex_bytes.len() as u64;
        if required > self.vertex_capacity {
            let capacity = required
                .next_power_of_two()
                .max(INITIAL_VERTEX_BUFFER_SIZE);
            self.vertex_buffer = create_vertex_buffer(&self.device, capacity);
            self.vertex_capacity = capacity;
        }

        let upload_start = now_ms();
        if !vertex_bytes.is_empty() {
            self.queue
                .write_buffer(&self.vertex_buffer, 0, &vertex_bytes);
        }
        let upload_ms = now_ms() - upload_start;

        self.vertex_count = (vertices.len() / 6) as u32;
        self.vertex_bytes = required;

        Ok(Float64Array::new_from_slice(&[
            prepare_ms,
            upload_ms,
            f64::from(self.vertex_count),
            required as f64,
        ]))
    }

    pub fn render(
        &mut self,
        transform: &[f32],
        background: &[f32],
        width: u32,
        height: u32,
    ) -> Result<Float64Array, JsValue> {
        if self.is_device_lost() {
            return Err(JsValue::from_str("retained wgpu device has been lost"));
        }
        if transform.len() != 6 || transform.iter().any(|value| !value.is_finite()) {
            return Err(JsValue::from_str(
                "retained wgpu frame requires one finite affine transform",
            ));
        }
        if background.len() != 4
            || background
                .iter()
                .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        {
            return Err(JsValue::from_str(
                "retained wgpu background must contain finite RGBA in [0, 1]",
            ));
        }

        self.resize(width, height);

        let uniform = [
            transform[0],
            transform[1],
            transform[2],
            transform[3],
            transform[4],
            transform[5],
            width as f32,
            height as f32,
        ];
        let uniform_bytes = float_bytes(&uniform);

        let upload_start = now_ms();
        self.queue
            .write_buffer(&self.frame_uniform_buffer, 0, &uniform_bytes);
        let upload_ms = now_ms() - upload_start;

        let render_start = now_ms();
        let Some(surface_frame) = self.acquire_surface_frame()? else {
            return Ok(Float64Array::new_from_slice(&[
                upload_ms,
                now_ms() - render_start,
                0.0,
                FRAME_UNIFORM_SIZE as f64,
                f64::from(self.vertex_count),
            ]));
        };

        let view = surface_frame.texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("viz-engine retained sRGB surface view"),
            format: Some(self.surface_view_format),
            ..Default::default()
        });
        let mut encoder =
            self.device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("viz-engine retained command encoder"),
                });
        let color_attachments = [Some(wgpu::RenderPassColorAttachment {
            view: &view,
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

        let draw_calls = if self.vertex_count > 0 { 1 } else { 0 };
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("viz-engine retained render pass"),
                color_attachments: &color_attachments,
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            if self.vertex_count > 0 {
                pass.set_pipeline(&self.pipeline);
                pass.set_bind_group(0, &self.frame_bind_group, &[]);
                pass.set_vertex_buffer(0, self.vertex_buffer.slice(..self.vertex_bytes));
                pass.draw(0..self.vertex_count, 0..1);
            }
        }

        self.queue.submit([encoder.finish()]);
        self.queue.present(surface_frame);
        let render_ms = now_ms() - render_start;

        Ok(Float64Array::new_from_slice(&[
            upload_ms,
            render_ms,
            f64::from(draw_calls),
            FRAME_UNIFORM_SIZE as f64,
            f64::from(self.vertex_count),
        ]))
    }

    fn resize(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if self.config.width == width && self.config.height == height {
            return;
        }

        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }

    fn acquire_surface_frame(&self) -> Result<Option<wgpu::SurfaceTexture>, JsValue> {
        use wgpu::CurrentSurfaceTexture;

        match self.surface.get_current_texture() {
            CurrentSurfaceTexture::Success(frame)
            | CurrentSurfaceTexture::Suboptimal(frame) => Ok(Some(frame)),
            CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(None),
            CurrentSurfaceTexture::Outdated | CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                match self.surface.get_current_texture() {
                    CurrentSurfaceTexture::Success(frame)
                    | CurrentSurfaceTexture::Suboptimal(frame) => Ok(Some(frame)),
                    CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(None),
                    CurrentSurfaceTexture::Outdated => Err(JsValue::from_str(
                        "retained wgpu surface remained outdated after reconfigure",
                    )),
                    CurrentSurfaceTexture::Lost => Err(JsValue::from_str(
                        "retained wgpu surface remained lost after reconfigure",
                    )),
                    CurrentSurfaceTexture::Validation => Err(JsValue::from_str(
                        "retained wgpu surface validation failure",
                    )),
                }
            }
            CurrentSurfaceTexture::Validation => Err(JsValue::from_str(
                "retained wgpu surface validation failure",
            )),
        }
    }
}

fn create_vertex_buffer(device: &wgpu::Device, size: u64) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("viz-engine retained polygon vertices"),
        size,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn vertex_bytes(vertices: &[f32]) -> Vec<u8> {
    float_bytes(vertices)
}

fn float_bytes(values: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(values));
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn srgb_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

fn now_ms() -> f64 {
    web_sys::window()
        .and_then(|window| window.performance())
        .map(|performance| performance.now())
        .unwrap_or_else(js_sys::Date::now)
}

fn js_error(context: &str, error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&format!("{context}: {error}"))
}
