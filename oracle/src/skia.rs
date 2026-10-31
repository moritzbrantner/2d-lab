//! The Skia oracle: tiny-skia (a Rust port of Skia's CPU rasterizer) drawing the packed frame
//! with Canvas 2D semantics: nonzero fill, then stroke with butt caps, miter joins, miter limit 10,
//! anti-aliased, per-command affine transform, sRGB-space blending.

use std::time::Instant;

use tiny_skia::{
    Color, FillRule, LineCap, LineJoin, Paint, PathBuilder, Pixmap, Stroke, Transform,
};
use viz_render_kernel::vello_scene::{
    CANVAS_MITER_LIMIT, FLAG_CLOSED, FLAG_FILL, FLAG_STROKE, VERB_CUBIC, VERB_LINE,
};

use crate::scene::Scene;

/// Renders the scene `frames` times; returns the last image and each frame's CPU time in ms.
pub fn render(scene: &Scene, frames: usize) -> Result<(Vec<u8>, Vec<f64>), String> {
    scene.vello_frame().validate()?;
    let mut times = Vec::new();
    let mut pixmap = None;
    for _ in 0..frames.max(1) {
        let start = Instant::now();
        pixmap = Some(draw(scene)?);
        times.push(start.elapsed().as_secs_f64() * 1e3);
    }
    Ok((pixmap.expect("one frame").take(), times))
}

fn draw(scene: &Scene) -> Result<Pixmap, String> {
    let v = &scene.vello;
    let mut pixmap = Pixmap::new(scene.width, scene.height).ok_or("invalid pixmap size")?;
    pixmap.fill(color(&v.background));
    for i in 0..v.spans.len() / 2 {
        let start = v.spans[i * 2] as usize;
        let verb_start = v.verb_spans[i * 2] as usize;
        let verb_len = v.verb_spans[i * 2 + 1] as usize;
        let p = &v.points;
        let mut builder = PathBuilder::new();
        builder.move_to(p[start], p[start + 1]);
        let mut at = start + 2;
        for verb in &v.verbs[verb_start..verb_start + verb_len] {
            match *verb {
                VERB_LINE => {
                    builder.line_to(p[at], p[at + 1]);
                    at += 2;
                }
                VERB_CUBIC => {
                    builder.cubic_to(p[at], p[at + 1], p[at + 2], p[at + 3], p[at + 4], p[at + 5]);
                    at += 6;
                }
                _ => return Err(format!("command {i} has an unknown verb")),
            }
        }
        let flags = v.flags[i];
        if flags & FLAG_CLOSED != 0 {
            builder.close();
        }
        let Some(path) = builder.finish() else {
            continue; // Degenerate (zero-area) path: Canvas draws nothing either.
        };
        let m = &v.transforms[i * 6..i * 6 + 6];
        let transform = Transform::from_row(m[0], m[1], m[2], m[3], m[4], m[5]);
        if flags & FLAG_FILL != 0 {
            let paint = paint(&v.fill_colors[i * 4..i * 4 + 4]);
            pixmap.fill_path(&path, &paint, FillRule::Winding, transform, None);
        }
        if flags & FLAG_STROKE != 0 {
            let paint = paint(&v.stroke_colors[i * 4..i * 4 + 4]);
            let stroke = Stroke {
                width: v.stroke_widths[i],
                line_cap: LineCap::Butt,
                line_join: LineJoin::Miter,
                miter_limit: CANVAS_MITER_LIMIT as f32,
                ..Stroke::default()
            };
            pixmap.stroke_path(&path, &paint, &stroke, transform, None);
        }
    }
    Ok(pixmap)
}

/// Quantized to 8 bits per channel like a parsed CSS color (and like the Vello adapter).
fn color(rgba: &[f32]) -> Color {
    let q = |v: f32| (v * 255.0).round().clamp(0.0, 255.0) as u8;
    Color::from_rgba8(q(rgba[0]), q(rgba[1]), q(rgba[2]), q(rgba[3]))
}

fn paint(rgba: &[f32]) -> Paint<'static> {
    let mut paint = Paint::default();
    paint.set_color(color(rgba));
    paint.anti_alias = true;
    paint
}
