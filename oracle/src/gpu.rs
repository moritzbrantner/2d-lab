//! Headless wgpu: the custom immediate path and Vello rendering into offscreen sRGB textures with
//! the kernel's own pipeline and scene adapter, plus GPU timestamp timing.

use std::time::Instant;

use viz_render_kernel::{
    build_convex_polygon_vertices,
    polygon_pipeline::{
        create_polygon_pipeline, create_vertex_buffer, encode_polygon_pass, vertex_bytes,
    },
    vello_gpu::{
        ClearSettings, RenderSize, RenderTargetConfig, Renderer, Scene as VelloScene, TargetInit,
        TextureBindings,
    },
    vello_scene::{color_from_f32, vello_target_format},
};

use crate::scene::Scene;

/// The custom path draws into an sRGB view of the canvas surface (its shader outputs linear
/// colour); Vello draws into the plain view (`vello_target_format`). The oracle's target is an
/// `Rgba8Unorm` texture with both views, so the read-back bytes are the pixels a browser shows.
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;

pub struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pub adapter: wgpu::AdapterInfo,
    timestamps: bool,
}

/// One rendered image plus, when timed, each frame's GPU and CPU (encode + submit) time in ms.
pub struct Rendered {
    pub rgba: Vec<u8>,
    pub gpu_ms: Vec<f64>,
    pub cpu_ms: Vec<f64>,
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

    /// The custom immediate path: Rust triangulation, one upload, one draw (as `webgpu.rs`).
    pub fn render_custom(&self, scene: &Scene, frames: usize) -> Result<Rendered, String> {
        let colors = scene
            .custom
            .colors
            .as_deref()
            .ok_or("custom path has no colors")?;
        let v = &scene.vello;
        let pipeline = create_polygon_pipeline(&self.device, FORMAT);
        let mut buffer: Option<(wgpu::Buffer, u64)> = None;
        self.run(scene, frames, FORMAT, |encoder, view| {
            let vertices = build_convex_polygon_vertices(
                &v.points,
                &v.spans,
                &v.transforms,
                colors,
                scene.width,
                scene.height,
            )?;
            let bytes = vertex_bytes(&vertices);
            let len = bytes.len() as u64;
            if buffer.as_ref().is_none_or(|(_, capacity)| *capacity < len) {
                let capacity = len.next_power_of_two().max(4096);
                buffer = Some((create_vertex_buffer(&self.device, capacity), capacity));
            }
            let (vertex_buffer, _) = buffer.as_ref().expect("allocated above");
            if len > 0 {
                self.queue.write_buffer(vertex_buffer, 0, &bytes);
            }
            encode_polygon_pass(
                encoder,
                view,
                &pipeline,
                vertex_buffer,
                len,
                (vertices.len() / 6) as u32,
                &v.background,
            );
            Ok(())
        })
    }

    /// Vello GPU with the lab's adapter (`vello_scene.rs`), as `vello_gpu_renderer.rs`.
    pub fn render_vello(&self, scene: &Scene, frames: usize) -> Result<Rendered, String> {
        let frame = scene.vello_frame();
        frame.validate()?;
        let width = u16::try_from(scene.width).map_err(|_| "width exceeds u16")?;
        let height = u16::try_from(scene.height).map_err(|_| "height exceeds u16")?;
        let (mut renderer, mut resources) = Renderer::new(
            &self.device,
            &RenderTargetConfig {
                format: vello_target_format(FORMAT),
                width,
                height,
            },
        );
        let render_size = RenderSize { width, height };
        let depth = Renderer::create_depth_texture_view(&self.device, &render_size);
        let clear = color_from_f32(frame.background)?;
        let mut vello_scene = VelloScene::new(width, height);
        self.run(
            scene,
            frames,
            vello_target_format(FORMAT),
            |encoder, view| {
                frame.encode(&mut vello_scene)?;
                renderer
                    .render(
                        &vello_scene,
                        &mut resources,
                        &self.device,
                        &self.queue,
                        encoder,
                        &render_size,
                        view,
                        Some(&depth),
                        &TextureBindings::new(),
                        TargetInit::Clear(ClearSettings::Viewport { color: clear }),
                    )
                    .map_err(|e| format!("Vello render failed: {e}"))
            },
        )
    }

    /// Renders `frames` frames (each re-preparing the whole frame, as the lab's immediate paths
    /// do) and reads back the last one. `record` prepares and encodes one frame.
    fn run(
        &self,
        scene: &Scene,
        frames: usize,
        view_format: wgpu::TextureFormat,
        mut record: impl FnMut(&mut wgpu::CommandEncoder, &wgpu::TextureView) -> Result<(), String>,
    ) -> Result<Rendered, String> {
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
        let query = self.timestamps.then(|| {
            let set = self.device.create_query_set(&wgpu::QuerySetDescriptor {
                label: Some("oracle timestamps"),
                ty: wgpu::QueryType::Timestamp,
                count: 2,
            });
            let resolve = self.buffer(
                16,
                wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
            );
            let readback = self.buffer(
                16,
                wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            );
            (set, resolve, readback)
        });
        let period = f64::from(self.queue.get_timestamp_period());
        let mut gpu_ms = Vec::new();
        let mut cpu_ms = Vec::new();
        for _ in 0..frames.max(1) {
            let start = Instant::now();
            let mut encoder = self.device.create_command_encoder(&Default::default());
            if let Some((set, _, _)) = &query {
                encoder.write_timestamp(set, 0);
            }
            record(&mut encoder, &view)?;
            if let Some((set, resolve, readback)) = &query {
                encoder.write_timestamp(set, 1);
                encoder.resolve_query_set(set, 0..2, resolve, 0);
                encoder.copy_buffer_to_buffer(resolve, 0, readback, 0, 16);
            }
            self.queue.submit([encoder.finish()]);
            cpu_ms.push(start.elapsed().as_secs_f64() * 1e3);
            if let Some((_, _, readback)) = &query {
                let bytes = self.read(readback)?;
                let begin = u64::from_le_bytes(bytes[0..8].try_into().expect("8 bytes"));
                let end = u64::from_le_bytes(bytes[8..16].try_into().expect("8 bytes"));
                gpu_ms.push(end.wrapping_sub(begin) as f64 * period / 1e6);
            } else {
                let _ = self.device.poll(wgpu::PollType::wait_indefinitely());
            }
        }

        let row = (width * 4).next_multiple_of(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
        let readback = self.buffer(
            u64::from(row) * u64::from(height),
            wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        );
        let mut encoder = self.device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            target.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(row),
                    rows_per_image: None,
                },
            },
            target.size(),
        );
        self.queue.submit([encoder.finish()]);
        let bytes = self.read(&readback)?;
        let mut rgba = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            let start = (y * row) as usize;
            rgba.extend_from_slice(&bytes[start..start + (width * 4) as usize]);
        }
        Ok(Rendered {
            rgba,
            gpu_ms,
            cpu_ms,
        })
    }

    fn buffer(&self, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
        self.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size,
            usage,
            mapped_at_creation: false,
        })
    }

    fn read(&self, buffer: &wgpu::Buffer) -> Result<Vec<u8>, String> {
        let slice = buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        let _ = self.device.poll(wgpu::PollType::wait_indefinitely());
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
