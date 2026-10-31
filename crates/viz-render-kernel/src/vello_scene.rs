//! Target-independent Vello adapter: encodes one packed 2d-lab frame (`packVelloFrame` in
//! `src/renderers/vello-frame.ts`) into a `vello_gpu::Scene`. The browser renderer and the oracle
//! share it, so the oracle measures the same adapter the lab runs.

use vello_gpu::{
    Scene,
    kurbo::{Affine, BezPath, Cap, Join, Stroke},
    peniko::Color,
};

pub const FLAG_CLOSED: u32 = 1;
pub const FLAG_FILL: u32 = 2;
pub const FLAG_STROKE: u32 = 4;
pub const VERB_LINE: u32 = 0;
pub const VERB_CUBIC: u32 = 1;

/// Canvas 2D's default miter limit; the display list has no stroke style beyond width, so every
/// renderer uses Canvas defaults (butt caps, miter joins, miter limit 10).
pub const CANVAS_MITER_LIMIT: f64 = 10.0;

/// The view format Vello renders into. Vello writes sRGB-encoded values itself, so it needs a
/// non-sRGB view; an `*Srgb` view would encode them a second time and wash the image out.
pub fn vello_target_format(surface_format: wgpu::TextureFormat) -> wgpu::TextureFormat {
    surface_format.remove_srgb_suffix()
}

/// One packed frame, borrowed from the arrays the TypeScript adapter produces.
#[derive(Clone, Copy)]
pub struct VelloFrame<'a> {
    pub points: &'a [f32],
    pub spans: &'a [u32],
    pub verbs: &'a [u32],
    pub verb_spans: &'a [u32],
    pub transforms: &'a [f32],
    pub fill_colors: &'a [f32],
    pub stroke_colors: &'a [f32],
    pub stroke_widths: &'a [f32],
    pub flags: &'a [u32],
    pub background: &'a [f32],
}

impl VelloFrame<'_> {
    pub fn validate(&self) -> Result<(), String> {
        if self.spans.len() % 2 != 0 {
            return Err("Vello spans must be start/length pairs".into());
        }
        let count = self.spans.len() / 2;
        if self.verb_spans.len() != count * 2 {
            return Err("Vello verb spans must match command count".into());
        }
        if self.transforms.len() != count * 6
            || self.fill_colors.len() != count * 4
            || self.stroke_colors.len() != count * 4
            || self.stroke_widths.len() != count
            || self.flags.len() != count
        {
            return Err("Vello frame arrays have mismatched lengths".into());
        }
        if self.background.len() != 4 {
            return Err("Vello background must contain RGBA".into());
        }

        for command_index in 0..count {
            let start = self.spans[command_index * 2] as usize;
            let len = self.spans[command_index * 2 + 1] as usize;
            if start % 2 != 0 || len % 2 != 0 || len < 4 || start + len > self.points.len() {
                return Err(format!(
                    "Vello command {command_index} has invalid geometry"
                ));
            }
            let verb_start = self.verb_spans[command_index * 2] as usize;
            let verb_len = self.verb_spans[command_index * 2 + 1] as usize;
            if verb_start + verb_len > self.verbs.len() {
                return Err(format!(
                    "Vello command {command_index} has an invalid verb span"
                ));
            }
            let mut expected_point_len = 2;
            for verb in &self.verbs[verb_start..verb_start + verb_len] {
                expected_point_len += match *verb {
                    VERB_LINE => 2,
                    VERB_CUBIC => 6,
                    _ => {
                        return Err(format!(
                            "Vello command {command_index} contains an unknown path verb"
                        ));
                    }
                };
            }
            if expected_point_len != len {
                return Err(format!(
                    "Vello command {command_index} path verbs do not consume its geometry"
                ));
            }
            if !self.stroke_widths[command_index].is_finite()
                || self.stroke_widths[command_index] <= 0.0
            {
                return Err(format!(
                    "Vello command {command_index} has invalid stroke width"
                ));
            }
        }

        Ok(())
    }

    /// Resets `scene` and encodes every command. Call `validate` first.
    pub fn encode(&self, scene: &mut Scene) -> Result<(), String> {
        scene.reset();
        let points = self.points;
        let command_count = self.spans.len() / 2;
        for command_index in 0..command_count {
            let start = self.spans[command_index * 2] as usize;
            let len = self.spans[command_index * 2 + 1] as usize;
            let flags = self.flags[command_index];

            let verb_start = self.verb_spans[command_index * 2] as usize;
            let verb_len = self.verb_spans[command_index * 2 + 1] as usize;
            let mut path = BezPath::new();
            path.move_to((f64::from(points[start]), f64::from(points[start + 1])));
            let mut point_offset = start + 2;
            for verb in &self.verbs[verb_start..verb_start + verb_len] {
                match *verb {
                    VERB_LINE => {
                        path.line_to((
                            f64::from(points[point_offset]),
                            f64::from(points[point_offset + 1]),
                        ));
                        point_offset += 2;
                    }
                    VERB_CUBIC => {
                        path.curve_to(
                            (
                                f64::from(points[point_offset]),
                                f64::from(points[point_offset + 1]),
                            ),
                            (
                                f64::from(points[point_offset + 2]),
                                f64::from(points[point_offset + 3]),
                            ),
                            (
                                f64::from(points[point_offset + 4]),
                                f64::from(points[point_offset + 5]),
                            ),
                        );
                        point_offset += 6;
                    }
                    _ => return Err("Vello path contains an unknown verb".into()),
                }
            }
            debug_assert_eq!(point_offset, start + len);
            if flags & FLAG_CLOSED != 0 {
                path.close_path();
            }

            let m = &self.transforms[command_index * 6..command_index * 6 + 6];
            scene.set_transform(Affine::new([
                f64::from(m[0]),
                f64::from(m[1]),
                f64::from(m[2]),
                f64::from(m[3]),
                f64::from(m[4]),
                f64::from(m[5]),
            ]));

            let color_offset = command_index * 4;
            if flags & FLAG_FILL != 0 {
                scene.set_paint(color_from_f32(
                    &self.fill_colors[color_offset..color_offset + 4],
                )?);
                scene.fill_path(&path);
            }

            if flags & FLAG_STROKE != 0 {
                scene.set_paint(color_from_f32(
                    &self.stroke_colors[color_offset..color_offset + 4],
                )?);
                scene.set_stroke(
                    Stroke::new(f64::from(self.stroke_widths[command_index]))
                        .with_caps(Cap::Butt)
                        .with_join(Join::Miter)
                        .with_miter_limit(CANVAS_MITER_LIMIT),
                );
                scene.stroke_path(&path);
            }
        }
        Ok(())
    }
}

pub fn color_from_f32(rgba: &[f32]) -> Result<Color, String> {
    if rgba.len() != 4
        || rgba
            .iter()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
    {
        return Err("Vello color must be finite RGBA in [0, 1]".into());
    }

    Ok(Color::from_rgba8(
        float_to_u8(rgba[0]),
        float_to_u8(rgba[1]),
        float_to_u8(rgba[2]),
        float_to_u8(rgba[3]),
    ))
}

fn float_to_u8(value: f32) -> u8 {
    (value * 255.0).round().clamp(0.0, 255.0) as u8
}
