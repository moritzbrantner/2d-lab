//! Headless wgpu: the custom immediate path and Vello rendering into offscreen sRGB textures with
//! the kernel's own pipeline and scene adapter, plus GPU timestamp timing.
//!
//! Both renderers split a frame into CPU preparation (the custom path's coverage geometry, Vello's
//! scene encoding and strip generation) and GPU recording (upload plus passes). GPU time is taken
//! the way render-engine's oracle takes it: untimed warm-up, then one prepared frame recorded and
//! submitted back to back in batches, its span read from timestamps at the start and end of each
//! frame's encoder. Re-preparing between submissions would leave the GPU idle most of the time, so
//! its clocks (and Vello's memory-bound strip pass most of all) would wander between power states.
//! CPU time is a separate untimed-GPU round that prepares every frame.

use std::time::{Duration, Instant};

use viz_render_kernel::{
    CoveragePolygons, PolygonFrame, build_coverage_polygons,
    polygon_pipeline::PolygonRenderer,
    vello_gpu::{
        ClearSettings, RenderSize, RenderTargetConfig, Renderer, Resources, Scene as VelloScene,
        TargetInit, TextureBindings,
    },
    vello_scene::{VelloFrame, color_from_f32, vello_target_format},
};

use crate::scene::Scene;

/// The surface format a browser hands out. The custom path and Vello both draw sRGB-encoded colour
/// into its plain (non-sRGB) view, so the read-back bytes are the pixels a browser shows.
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
/// Frames submitted back to back between timestamp read-backs.
const BATCH: usize = 64;
/// Untimed frames before timing: at least this many, for at least `WARM_UP`.
const WARM_UP_FRAMES: usize = 3;
const WARM_UP: Duration = Duration::from_millis(250);

pub struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pub adapter: wgpu::AdapterInfo,
    timestamps: bool,
}

/// One renderer's frame, split into CPU preparation and GPU recording.
trait Draw {
    fn prepare(&mut self) -> Result<(), String>;
    fn record(
        &mut self,
        gpu: &Gpu,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
    ) -> Result<(), String>;
}

struct CustomDraw<'a> {
    frame: PolygonFrame<'a>,
    background: &'a [f32],
    width: u32,
    height: u32,
    renderer: PolygonRenderer,
    geometry: CoveragePolygons,
}

impl Draw for CustomDraw<'_> {
    fn prepare(&mut self) -> Result<(), String> {
        self.geometry = build_coverage_polygons(&self.frame, self.width, self.height)?;
        Ok(())
    }

    fn record(
        &mut self,
        gpu: &Gpu,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
    ) -> Result<(), String> {
        self.renderer
            .upload(&gpu.device, &gpu.queue, &self.geometry);
        self.renderer.encode(encoder, view, self.background);
        Ok(())
    }
}

struct VelloDraw<'a> {
    frame: VelloFrame<'a>,
    renderer: Renderer,
    resources: Resources,
    scene: VelloScene,
    size: RenderSize,
    depth: wgpu::TextureView,
    clear: viz_render_kernel::vello_gpu::peniko::Color,
}

impl Draw for VelloDraw<'_> {
    fn prepare(&mut self) -> Result<(), String> {
        self.frame.encode(&mut self.scene)
    }

    fn record(
        &mut self,
        gpu: &Gpu,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
    ) -> Result<(), String> {
        self.renderer
            .render(
                &self.scene,
                &mut self.resources,
                &gpu.device,
                &gpu.queue,
                encoder,
                &self.size,
                view,
                Some(&self.depth),
                &TextureBindings::new(),
                TargetInit::Clear(ClearSettings::Viewport { color: self.clear }),
            )
            .map_err(|e| format!("Vello render failed: {e}"))
    }
}

/// One renderer bound to its own offscreen target, drawing frames of one scene.
pub struct Side<'a> {
    gpu: &'a Gpu,
    width: u32,
    height: u32,
    target: wgpu::Texture,
    view: wgpu::TextureView,
    draw: Box<dyn Draw + 'a>,
}

impl Gpu {
    pub fn new() -> Result<Self, String> {
        let instance =
            wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let force_fallback_adapter = std::env::var("WGPU_FORCE_FALLBACK_ADAPTER")
            .is_ok_and(|v| !(v.is_empty() || v == "0" || v == "false"));
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter,
            compatible_surface: None,
            apply_limit_buckets: false,
        }))
        .map_err(|e| format!("no wgpu adapter: {e}"))?;
        let wanted =
            wgpu::Features::TIMESTAMP_QUERY | wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS;
        let timestamps = adapter.features().contains(wanted);
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("2d-lab oracle"),
            required_features: adapter.features() & wanted,
            ..Default::default()
        }))
        .map_err(|e| format!("no wgpu device: {e}"))?;
        Ok(Self {
            device,
            queue,
            adapter: adapter.get_info(),
            timestamps,
        })
    }

    pub fn timestamps(&self) -> bool {
        self.timestamps
    }

    pub fn software(&self) -> bool {
        self.adapter.device_type == wgpu::DeviceType::Cpu
    }

    /// The custom immediate path: Rust coverage geometry, one upload, one draw (as `webgpu.rs`).
    pub fn custom<'a>(&'a self, scene: &'a Scene) -> Side<'a> {
        let v = &scene.vello;
        let format = FORMAT.remove_srgb_suffix();
        let draw = CustomDraw {
            frame: PolygonFrame {
                points: &v.points,
                spans: &v.spans,
                verbs: &v.verbs,
                verb_spans: &v.verb_spans,
                transforms: &v.transforms,
                fill_colors: &v.fill_colors,
                stroke_colors: &v.stroke_colors,
                stroke_widths: &v.stroke_widths,
                miter_limits: &v.miter_limits,
                flags: &v.flags,
            },
            background: &v.background,
            width: scene.width,
            height: scene.height,
            renderer: PolygonRenderer::new(&self.device, format),
            geometry: CoveragePolygons::default(),
        };
        self.side(scene, format, Box::new(draw))
    }

    /// Vello GPU with the lab's adapter (`vello_scene.rs`), as `vello_gpu_renderer.rs`.
    pub fn vello<'a>(&'a self, scene: &'a Scene) -> Result<Side<'a>, String> {
        let frame = scene.vello_frame();
        frame.validate()?;
        let width = u16::try_from(scene.width).map_err(|_| "width exceeds u16")?;
        let height = u16::try_from(scene.height).map_err(|_| "height exceeds u16")?;
        let (renderer, resources) = Renderer::new(
            &self.device,
            &RenderTargetConfig {
                format: vello_target_format(FORMAT),
                width,
                height,
            },
        );
        let size = RenderSize { width, height };
        let draw = VelloDraw {
            frame,
            renderer,
            resources,
            scene: VelloScene::new(width, height),
            depth: Renderer::create_depth_texture_view(&self.device, &size),
            size,
            clear: color_from_f32(frame.background)?,
        };
        Ok(self.side(scene, vello_target_format(FORMAT), Box::new(draw)))
    }

    fn side<'a>(
        &'a self,
        scene: &Scene,
        view_format: wgpu::TextureFormat,
        draw: Box<dyn Draw + 'a>,
    ) -> Side<'a> {
        let (width, height) = (scene.width, scene.height);
        let target = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("oracle target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT.remove_srgb_suffix(),
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[FORMAT],
        });
        let view = target.create_view(&wgpu::TextureViewDescriptor {
            format: Some(view_format),
            ..Default::default()
        });
        Side {
            gpu: self,
            width,
            height,
            target,
            view,
            draw,
        }
    }

    fn buffer(&self, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
        self.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size,
            usage,
            mapped_at_creation: false,
        })
    }

    fn wait(&self) {
        let _ = self.device.poll(wgpu::PollType::wait_indefinitely());
    }

    fn read(&self, buffer: &wgpu::Buffer) -> Result<Vec<u8>, String> {
        let slice = buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        self.wait();
        rx.recv()
            .map_err(|_| "map_async callback dropped".to_string())?
            .map_err(|e| format!("readback failed: {e}"))?;
        let bytes = slice
            .get_mapped_range()
            .map_err(|e| format!("readback not mapped: {e:?}"))?
            .to_vec();
        buffer.unmap();
        Ok(bytes)
    }
}

impl Side<'_> {
    /// Records and submits the prepared frame, with timestamps `2 * slot` and `2 * slot + 1`.
    fn submit(&mut self, query: Option<(&wgpu::QuerySet, u32)>) -> Result<(), String> {
        let gpu = self.gpu;
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        if let Some((set, slot)) = query {
            encoder.write_timestamp(set, slot * 2);
        }
        self.draw.record(gpu, &mut encoder, &self.view)?;
        if let Some((set, slot)) = query {
            encoder.write_timestamp(set, slot * 2 + 1);
        }
        gpu.queue.submit([encoder.finish()]);
        Ok(())
    }

    /// Untimed frames, so pipelines, buffers and GPU clocks have settled before timing.
    pub fn warm_up(&mut self) -> Result<(), String> {
        self.draw.prepare()?;
        let start = Instant::now();
        let mut frames = 0;
        while frames < WARM_UP_FRAMES || start.elapsed() < WARM_UP {
            self.submit(None)?;
            frames += 1;
            if frames % BATCH == 0 {
                self.gpu.wait();
            }
        }
        self.gpu.wait();
        Ok(())
    }

    /// Each of `frames` prepared-frame submissions' GPU time in ms, back to back in batches of
    /// `BATCH`. Empty without timestamp queries.
    pub fn gpu_round(&mut self, frames: usize) -> Result<Vec<f64>, String> {
        let gpu = self.gpu;
        if !gpu.timestamps {
            return Ok(Vec::new());
        }
        self.draw.prepare()?;
        let bytes = (BATCH * 16) as u64;
        let set = gpu.device.create_query_set(&wgpu::QuerySetDescriptor {
            label: Some("oracle timestamps"),
            ty: wgpu::QueryType::Timestamp,
            count: (BATCH * 2) as u32,
        });
        let resolve = gpu.buffer(
            bytes,
            wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
        );
        let readback = gpu.buffer(
            bytes,
            wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        );
        let period = f64::from(gpu.queue.get_timestamp_period());
        let mut times = Vec::with_capacity(frames);
        let mut left = frames.max(1);
        while left > 0 {
            let batch = left.min(BATCH);
            left -= batch;
            for slot in 0..batch {
                self.submit(Some((&set, slot as u32)))?;
            }
            let mut encoder = gpu.device.create_command_encoder(&Default::default());
            encoder.resolve_query_set(&set, 0..(batch * 2) as u32, &resolve, 0);
            encoder.copy_buffer_to_buffer(&resolve, 0, &readback, 0, (batch * 16) as u64);
            gpu.queue.submit([encoder.finish()]);
            let stamps = gpu.read(&readback)?;
            let stamp = |i: usize| u64::from_le_bytes(stamps[i * 8..i * 8 + 8].try_into().unwrap());
            for slot in 0..batch {
                let span = stamp(slot * 2 + 1).wrapping_sub(stamp(slot * 2));
                times.push(span as f64 * period / 1e6);
            }
        }
        Ok(times)
    }

    /// Each of `frames` whole frames' CPU time (prepare + record + submit) in ms.
    pub fn cpu_round(&mut self, frames: usize) -> Result<Vec<f64>, String> {
        let mut times = Vec::with_capacity(frames);
        for frame in 0..frames.max(1) {
            let start = Instant::now();
            self.draw.prepare()?;
            self.submit(None)?;
            times.push(start.elapsed().as_secs_f64() * 1e3);
            if frame % BATCH == BATCH - 1 {
                self.gpu.wait();
            }
        }
        self.gpu.wait();
        Ok(times)
    }

    /// Prepares and renders one frame and reads it back as tightly packed RGBA.
    pub fn image(&mut self) -> Result<Vec<u8>, String> {
        self.draw.prepare()?;
        self.submit(None)?;
        let gpu = self.gpu;
        let (width, height) = (self.width, self.height);
        let row = (width * 4).next_multiple_of(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
        let readback = gpu.buffer(
            u64::from(row) * u64::from(height),
            wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        );
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            self.target.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(row),
                    rows_per_image: None,
                },
            },
            self.target.size(),
        );
        gpu.queue.submit([encoder.finish()]);
        let bytes = gpu.read(&readback)?;
        let mut rgba = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            let start = (y * row) as usize;
            rgba.extend_from_slice(&bytes[start..start + (width * 4) as usize]);
        }
        Ok(rgba)
    }
}
