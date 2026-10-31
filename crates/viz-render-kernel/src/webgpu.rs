use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use js_sys::{Date, Float64Array};
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

use crate::build_convex_polygon_vertices;
use crate::polygon_pipeline::{
    create_polygon_pipeline, create_vertex_buffer, encode_polygon_pass, vertex_bytes,
};

const INITIAL_VERTEX_BUFFER_SIZE: u64 = 4 * 1024;

#[wasm_bindgen]
pub struct WgpuPolygonRenderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    surface_view_format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    vertex_capacity: u64,
    device_lost: Arc<AtomicBool>,
}

#[wasm_bindgen(js_name = createWgpuPolygonRenderer)]
pub async fn create_wgpu_polygon_renderer(
    canvas: HtmlCanvasElement,
) -> Result<WgpuPolygonRenderer, JsValue> {
    WgpuPolygonRenderer::new(canvas).await
}

#[wasm_bindgen]
impl WgpuPolygonRenderer {
    async fn new(canvas: HtmlCanvasElement) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::default();
        let surface: wgpu::Surface<'static> = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|error| js_error("could not create wgpu canvas surface", error))?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| js_error("could not acquire wgpu adapter", error))?;

        let capabilities = surface.get_capabilities(&adapter);
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|error| js_error("could not acquire wgpu device", error))?;

        let device_lost = Arc::new(AtomicBool::new(false));
        let lost_signal = Arc::clone(&device_lost);
        device.set_device_lost_callback(move |_reason, _message| {
            lost_signal.store(true, Ordering::Release);
        });

        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| JsValue::from_str("wgpu surface has no compatible configuration"))?;

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

        let pipeline = create_polygon_pipeline(&device, surface_view_format);
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
            device_lost,
        })
    }

    #[wasm_bindgen(js_name = isDeviceLost)]
    pub fn is_device_lost(&self) -> bool {
        self.device_lost.load(Ordering::Acquire)
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if self.config.width == width && self.config.height == height {
            return;
        }

        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }

    pub fn render(
        &mut self,
        points: &[f32],
        spans: &[u32],
        transforms: &[f32],
        colors: &[f32],
        background: &[f32],
        width: u32,
        height: u32,
    ) -> Result<Float64Array, JsValue> {
        if self.is_device_lost() {
            return Err(JsValue::from_str("wgpu device has been lost"));
        }
        if background.len() != 4
            || background
                .iter()
                .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        {
            return Err(JsValue::from_str(
                "background must contain four finite RGBA values in [0, 1]",
            ));
        }

        self.resize(width, height);

        let prepare_start = now_ms();
        let vertices =
            build_convex_polygon_vertices(points, spans, transforms, colors, width, height)
                .map_err(|message| JsValue::from_str(&message))?;
        let vertex_bytes = vertex_bytes(&vertices);
        let prepare_ms = now_ms() - prepare_start;

        let required = vertex_bytes.len() as u64;
        if required > self.vertex_capacity {
            let capacity = required.next_power_of_two().max(INITIAL_VERTEX_BUFFER_SIZE);
            self.vertex_buffer = create_vertex_buffer(&self.device, capacity);
            self.vertex_capacity = capacity;
        }

        let upload_start = now_ms();
        if !vertex_bytes.is_empty() {
            self.queue
                .write_buffer(&self.vertex_buffer, 0, &vertex_bytes);
        }
        let upload_ms = now_ms() - upload_start;

        let submit_start = now_ms();
        let Some(surface_frame) = self.acquire_surface_frame()? else {
            return Ok(metrics(
                prepare_ms,
                upload_ms,
                now_ms() - submit_start,
                vertices.len() / 6,
                required,
                0,
            ));
        };

        let view = surface_frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor {
                label: Some("2d-lab sRGB surface view"),
                format: Some(self.surface_view_format),
                ..Default::default()
            });
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("2d-lab polygon command encoder"),
            });

        let vertex_count = (vertices.len() / 6) as u32;
        let draw_calls = encode_polygon_pass(
            &mut encoder,
            &view,
            &self.pipeline,
            &self.vertex_buffer,
            required,
            vertex_count,
            background,
        );

        self.queue.submit([encoder.finish()]);
        self.queue.present(surface_frame);
        let submit_ms = now_ms() - submit_start;

        Ok(metrics(
            prepare_ms,
            upload_ms,
            submit_ms,
            vertex_count as usize,
            required,
            draw_calls,
        ))
    }

    fn acquire_surface_frame(&self) -> Result<Option<wgpu::SurfaceTexture>, JsValue> {
        use wgpu::CurrentSurfaceTexture;

        match self.surface.get_current_texture() {
            CurrentSurfaceTexture::Success(frame) | CurrentSurfaceTexture::Suboptimal(frame) => {
                Ok(Some(frame))
            }
            CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(None),
            CurrentSurfaceTexture::Outdated | CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                match self.surface.get_current_texture() {
                    CurrentSurfaceTexture::Success(frame)
                    | CurrentSurfaceTexture::Suboptimal(frame) => Ok(Some(frame)),
                    CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(None),
                    CurrentSurfaceTexture::Outdated => Err(JsValue::from_str(
                        "wgpu surface remained outdated after reconfigure",
                    )),
                    CurrentSurfaceTexture::Lost => Err(JsValue::from_str(
                        "wgpu surface remained lost after reconfigure",
                    )),
                    CurrentSurfaceTexture::Validation => {
                        Err(JsValue::from_str("wgpu surface validation failure"))
                    }
                }
            }
            CurrentSurfaceTexture::Validation => {
                Err(JsValue::from_str("wgpu surface validation failure"))
            }
        }
    }
}

fn now_ms() -> f64 {
    web_sys::window()
        .and_then(|window| window.performance())
        .map(|performance| performance.now())
        .unwrap_or_else(Date::now)
}

fn metrics(
    prepare_ms: f64,
    upload_ms: f64,
    submit_ms: f64,
    vertex_count: usize,
    upload_bytes: u64,
    draw_calls: u32,
) -> Float64Array {
    Float64Array::new_from_slice(&[
        prepare_ms,
        upload_ms,
        submit_ms,
        vertex_count as f64,
        upload_bytes as f64,
        draw_calls as f64,
    ])
}

fn js_error(context: &str, error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&format!("{context}: {error}"))
}
