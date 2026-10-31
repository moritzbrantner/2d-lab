use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use js_sys::Float64Array;
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

use vello_gpu::{
    ClearSettings, RenderSize, RenderTargetConfig, Renderer, Resources, Scene, TargetInit,
    TextureBindings,
};

use crate::vello_scene::{VelloFrame, color_from_f32, vello_target_format};

#[wasm_bindgen]
pub struct VelloGpuRenderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    surface_view_format: wgpu::TextureFormat,
    renderer: Renderer,
    resources: Resources,
    render_size: RenderSize,
    depth_texture_view: wgpu::TextureView,
    scene: Scene,
    device_lost: Arc<AtomicBool>,
}

#[wasm_bindgen(js_name = createVelloGpuRenderer)]
pub async fn create_vello_gpu_renderer(
    canvas: HtmlCanvasElement,
) -> Result<VelloGpuRenderer, JsValue> {
    VelloGpuRenderer::new(canvas).await
}

#[wasm_bindgen]
impl VelloGpuRenderer {
    async fn new(canvas: HtmlCanvasElement) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::default();
        let surface: wgpu::Surface<'static> = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|error| js_error("could not create Vello wgpu canvas surface", error))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| js_error("could not acquire Vello wgpu adapter", error))?;
        let capabilities = surface.get_capabilities(&adapter);
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|error| js_error("could not acquire Vello wgpu device", error))?;

        let device_lost = Arc::new(AtomicBool::new(false));
        let lost_signal = Arc::clone(&device_lost);
        device.set_device_lost_callback(move |_reason, _message| {
            lost_signal.store(true, Ordering::Release);
        });

        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| {
                JsValue::from_str("Vello wgpu surface has no compatible configuration")
            })?;
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

        let surface_view_format = vello_target_format(config.format);
        if surface_view_format != config.format {
            config.view_formats = vec![surface_view_format];
        }
        surface.configure(&device, &config);

        let (renderer, resources, render_size, depth_texture_view, scene) =
            create_vello_state(&device, surface_view_format, width, height)?;

        Ok(Self {
            surface,
            device,
            queue,
            config,
            surface_view_format,
            renderer,
            resources,
            render_size,
            depth_texture_view,
            scene,
            device_lost,
        })
    }

    #[wasm_bindgen(js_name = isDeviceLost)]
    pub fn is_device_lost(&self) -> bool {
        self.device_lost.load(Ordering::Acquire)
    }

    pub fn render(
        &mut self,
        points: &[f32],
        spans: &[u32],
        verbs: &[u32],
        verb_spans: &[u32],
        transforms: &[f32],
        fill_colors: &[f32],
        stroke_colors: &[f32],
        stroke_widths: &[f32],
        flags: &[u32],
        background: &[f32],
        width: u32,
        height: u32,
    ) -> Result<Float64Array, JsValue> {
        if self.is_device_lost() {
            return Err(JsValue::from_str("Vello wgpu device has been lost"));
        }
        let frame = VelloFrame {
            points,
            spans,
            verbs,
            verb_spans,
            transforms,
            fill_colors,
            stroke_colors,
            stroke_widths,
            flags,
            background,
        };
        frame
            .validate()
            .map_err(|message| JsValue::from_str(&message))?;
        self.resize(width, height)?;

        let prepare_start = now_ms();
        frame
            .encode(&mut self.scene)
            .map_err(|message| JsValue::from_str(&message))?;
        let prepare_ms = now_ms() - prepare_start;

        let render_start = now_ms();
        let Some(surface_frame) = acquire_surface_frame(&self.surface, &self.device, &self.config)?
        else {
            return Ok(Float64Array::new_from_slice(&[
                prepare_ms,
                now_ms() - render_start,
            ]));
        };

        let view = surface_frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor {
                label: Some("2d-lab Vello sRGB surface view"),
                format: Some(self.surface_view_format),
                ..Default::default()
            });
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("2d-lab Vello command encoder"),
            });

        let clear_color =
            color_from_f32(background).map_err(|message| JsValue::from_str(&message))?;
        self.renderer
            .render(
                &self.scene,
                &mut self.resources,
                &self.device,
                &self.queue,
                &mut encoder,
                &self.render_size,
                &view,
                Some(&self.depth_texture_view),
                &TextureBindings::new(),
                TargetInit::Clear(ClearSettings::Viewport { color: clear_color }),
            )
            .map_err(|error| js_error("Vello render failed", error))?;

        self.queue.submit([encoder.finish()]);
        self.queue.present(surface_frame);
        let render_ms = now_ms() - render_start;

        Ok(Float64Array::new_from_slice(&[prepare_ms, render_ms]))
    }

    fn resize(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        let width = width.max(1);
        let height = height.max(1);
        if self.config.width == width && self.config.height == height {
            return Ok(());
        }

        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);

        let (renderer, resources, render_size, depth_texture_view, scene) =
            create_vello_state(&self.device, self.surface_view_format, width, height)?;
        self.renderer = renderer;
        self.resources = resources;
        self.render_size = render_size;
        self.depth_texture_view = depth_texture_view;
        self.scene = scene;
        Ok(())
    }
}

fn create_vello_state(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    width: u32,
    height: u32,
) -> Result<(Renderer, Resources, RenderSize, wgpu::TextureView, Scene), JsValue> {
    let width = u16::try_from(width).map_err(|_| JsValue::from_str("Vello width exceeds u16"))?;
    let height =
        u16::try_from(height).map_err(|_| JsValue::from_str("Vello height exceeds u16"))?;
    let target_config = RenderTargetConfig {
        format,
        width,
        height,
    };
    let (renderer, resources) = Renderer::new(device, &target_config);
    let render_size = RenderSize { width, height };
    let depth_texture_view = Renderer::create_depth_texture_view(device, &render_size);
    let scene = Scene::new(width, height);
    Ok((renderer, resources, render_size, depth_texture_view, scene))
}

fn acquire_surface_frame(
    surface: &wgpu::Surface<'static>,
    device: &wgpu::Device,
    config: &wgpu::SurfaceConfiguration,
) -> Result<Option<wgpu::SurfaceTexture>, JsValue> {
    use wgpu::CurrentSurfaceTexture;

    match surface.get_current_texture() {
        CurrentSurfaceTexture::Success(frame) | CurrentSurfaceTexture::Suboptimal(frame) => {
            Ok(Some(frame))
        }
        CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(None),
        CurrentSurfaceTexture::Outdated | CurrentSurfaceTexture::Lost => {
            surface.configure(device, config);
            match surface.get_current_texture() {
                CurrentSurfaceTexture::Success(frame)
                | CurrentSurfaceTexture::Suboptimal(frame) => Ok(Some(frame)),
                CurrentSurfaceTexture::Timeout | CurrentSurfaceTexture::Occluded => Ok(None),
                CurrentSurfaceTexture::Outdated => Err(JsValue::from_str(
                    "Vello surface remained outdated after reconfigure",
                )),
                CurrentSurfaceTexture::Lost => Err(JsValue::from_str(
                    "Vello surface remained lost after reconfigure",
                )),
                CurrentSurfaceTexture::Validation => {
                    Err(JsValue::from_str("Vello surface validation failure"))
                }
            }
        }
        CurrentSurfaceTexture::Validation => {
            Err(JsValue::from_str("Vello surface validation failure"))
        }
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
