#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
use wasm_bindgen::prelude::*;

#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod retained_webgpu;
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod vello_gpu_renderer;
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod webgpu;

const CONVEX_EPSILON: f32 = 1.0e-5;
const GPU_VERTEX_FLOATS: usize = 6;

#[cfg_attr(
    all(target_arch = "wasm32", target_os = "unknown"),
    wasm_bindgen
)]
pub fn transform_batches(points: &[f32], spans: &[u32], transforms: &[f32]) -> Vec<f32> {
    assert_eq!(
        spans.len() % 2,
        0,
        "spans must contain start/length pairs"
    );

    let command_count = spans.len() / 2;
    assert_eq!(
        transforms.len(),
        command_count * 6,
        "each command must provide one affine transform"
    );

    let mut output = points.to_vec();

    for command_index in 0..command_count {
        let start = spans[command_index * 2] as usize;
        let len = spans[command_index * 2 + 1] as usize;

        assert_eq!(start % 2, 0, "point span must start on an x coordinate");
        assert_eq!(len % 2, 0, "point span must contain complete x/y pairs");
        assert!(start + len <= points.len(), "point span exceeds point buffer");

        let matrix_offset = command_index * 6;
        let transform = &transforms[matrix_offset..matrix_offset + 6];

        for point_offset in (start..start + len).step_by(2) {
            let (x, y) = transform_point(
                points[point_offset],
                points[point_offset + 1],
                transform,
            );
            output[point_offset] = x;
            output[point_offset + 1] = y;
        }
    }

    output
}

pub(crate) fn build_convex_polygon_vertices(
    points: &[f32],
    spans: &[u32],
    transforms: &[f32],
    colors: &[f32],
    width: u32,
    height: u32,
) -> Result<Vec<f32>, String> {
    if width == 0 || height == 0 {
        return Err("render extent must be non-zero".into());
    }
    validate_polygon_arrays(points, spans, colors)?;

    let command_count = spans.len() / 2;
    if transforms.len() != command_count * 6 {
        return Err("each command must provide one affine transform".into());
    }

    let mut output = Vec::new();
    let width = width as f32;
    let height = height as f32;

    for command_index in 0..command_count {
        let (start, len) = validated_span(points, spans, command_index)?;
        let polygon = &points[start..start + len];
        if !is_convex_polygon(polygon) {
            return Err(format!(
                "command {command_index} is not a non-degenerate convex polygon"
            ));
        }

        let matrix_offset = command_index * 6;
        let transform = &transforms[matrix_offset..matrix_offset + 6];
        if transform.iter().any(|value| !value.is_finite()) {
            return Err(format!(
                "command {command_index} has a non-finite affine transform"
            ));
        }

        let color_offset = command_index * 4;
        let color = &colors[color_offset..color_offset + 4];
        append_triangle_fan(&mut output, points, start, len, color, |x, y| {
            let (screen_x, screen_y) = transform_point(x, y, transform);
            if !screen_x.is_finite() || !screen_y.is_finite() {
                return Err("transformed polygon coordinate is non-finite".into());
            }

            let clip_x = screen_x / width * 2.0 - 1.0;
            let clip_y = 1.0 - screen_y / height * 2.0;
            if !clip_x.is_finite() || !clip_y.is_finite() {
                return Err("polygon coordinate is not representable in clip space".into());
            }
            Ok((clip_x, clip_y))
        })?;
    }

    Ok(output)
}

pub(crate) fn build_local_convex_polygon_vertices(
    points: &[f32],
    spans: &[u32],
    colors: &[f32],
) -> Result<Vec<f32>, String> {
    validate_polygon_arrays(points, spans, colors)?;
    let command_count = spans.len() / 2;
    let mut output = Vec::new();

    for command_index in 0..command_count {
        let (start, len) = validated_span(points, spans, command_index)?;
        let polygon = &points[start..start + len];
        if !is_convex_polygon(polygon) {
            return Err(format!(
                "command {command_index} is not a non-degenerate convex polygon"
            ));
        }
        let color_offset = command_index * 4;
        let color = &colors[color_offset..color_offset + 4];

        append_triangle_fan(&mut output, points, start, len, color, |x, y| {
            if !x.is_finite() || !y.is_finite() {
                return Err("polygon coordinate is non-finite".into());
            }
            Ok((x, y))
        })?;
    }

    Ok(output)
}

fn validate_polygon_arrays(
    points: &[f32],
    spans: &[u32],
    colors: &[f32],
) -> Result<(), String> {
    if spans.len() % 2 != 0 {
        return Err("spans must contain start/length pairs".into());
    }
    let command_count = spans.len() / 2;
    if colors.len() != command_count * 4 {
        return Err("each command must provide one RGBA color".into());
    }
    for command_index in 0..command_count {
        let _ = validated_span(points, spans, command_index)?;
        let color_offset = command_index * 4;
        if colors[color_offset..color_offset + 4]
            .iter()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        {
            return Err(format!(
                "command {command_index} has an invalid RGBA color"
            ));
        }
    }
    Ok(())
}

fn validated_span(
    points: &[f32],
    spans: &[u32],
    command_index: usize,
) -> Result<(usize, usize), String> {
    let start = spans[command_index * 2] as usize;
    let len = spans[command_index * 2 + 1] as usize;
    if start % 2 != 0 || len % 2 != 0 || len < 6 || start + len > points.len() {
        return Err(format!("command {command_index} has an invalid polygon span"));
    }
    Ok((start, len))
}

fn append_triangle_fan(
    output: &mut Vec<f32>,
    points: &[f32],
    start: usize,
    len: usize,
    color: &[f32],
    mut map: impl FnMut(f32, f32) -> Result<(f32, f32), String>,
) -> Result<(), String> {
    let point_count = len / 2;
    output.reserve((point_count - 2) * 3 * GPU_VERTEX_FLOATS);

    for triangle_index in 1..point_count - 1 {
        for point_index in [0, triangle_index, triangle_index + 1] {
            let point_offset = start + point_index * 2;
            let (x, y) = map(points[point_offset], points[point_offset + 1])?;
            output.extend_from_slice(&[
                x, y, color[0], color[1], color[2], color[3],
            ]);
        }
    }

    Ok(())
}

fn transform_point(x: f32, y: f32, transform: &[f32]) -> (f32, f32) {
    (
        transform[0] * x + transform[2] * y + transform[4],
        transform[1] * x + transform[3] * y + transform[5],
    )
}

fn is_convex_polygon(points: &[f32]) -> bool {
    let point_count = points.len() / 2;
    if point_count < 3 {
        return false;
    }

    let mut orientation = 0.0_f32;
    for index in 0..point_count {
        let first = point(points, index);
        let second = point(points, (index + 1) % point_count);
        let third = point(points, (index + 2) % point_count);
        let cross = (second.0 - first.0) * (third.1 - second.1)
            - (second.1 - first.1) * (third.0 - second.0);

        if cross.abs() <= CONVEX_EPSILON {
            continue;
        }

        let sign = cross.signum();
        if orientation == 0.0 {
            orientation = sign;
        } else if sign != orientation {
            return false;
        }
    }

    orientation != 0.0
}

fn point(points: &[f32], index: usize) -> (f32, f32) {
    (points[index * 2], points[index * 2 + 1])
}

#[cfg(test)]
mod tests {
    use super::{
        build_convex_polygon_vertices, build_local_convex_polygon_vertices,
        transform_batches,
    };

    #[test]
    fn transforms_multiple_batches_without_touching_other_ranges() {
        let points = [0.0, 0.0, 2.0, 0.0, 1.0, 1.0, 3.0, 2.0];
        let spans = [0, 4, 4, 4];
        let transforms = [
            1.0, 0.0, 0.0, 1.0, 10.0, 20.0, 2.0, 0.0, 0.0, 3.0, -1.0, 4.0,
        ];

        let actual = transform_batches(&points, &spans, &transforms);

        assert_eq!(
            actual,
            vec![10.0, 20.0, 12.0, 20.0, 1.0, 7.0, 5.0, 10.0]
        );
    }

    #[test]
    fn supports_rotation_matrix_layout_used_by_canvas() {
        let points = [2.0, 0.0];
        let spans = [0, 2];
        let transforms = [0.0, 1.0, -1.0, 0.0, 5.0, 7.0];

        let actual = transform_batches(&points, &spans, &transforms);

        assert_eq!(actual, vec![5.0, 9.0]);
    }

    #[test]
    fn triangulates_convex_quads_into_clip_space() {
        let vertices = build_convex_polygon_vertices(
            &[0.0, 0.0, 100.0, 0.0, 100.0, 100.0, 0.0, 100.0],
            &[0, 8],
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            &[0.25, 0.5, 0.75, 1.0],
            100,
            100,
        )
        .expect("convex quad should triangulate");

        assert_eq!(vertices.len(), 6 * 6);
        assert_eq!(&vertices[0..6], &[-1.0, 1.0, 0.25, 0.5, 0.75, 1.0]);
        assert_eq!(&vertices[6..12], &[1.0, 1.0, 0.25, 0.5, 0.75, 1.0]);
        assert_eq!(&vertices[12..18], &[1.0, -1.0, 0.25, 0.5, 0.75, 1.0]);
    }

    #[test]
    fn retained_vertices_keep_local_coordinates() {
        let vertices = build_local_convex_polygon_vertices(
            &[0.0, 0.0, 10.0, 0.0, 10.0, 5.0, 0.0, 5.0],
            &[0, 8],
            &[0.1, 0.2, 0.3, 1.0],
        )
        .expect("local quad should triangulate");

        assert_eq!(&vertices[0..6], &[0.0, 0.0, 0.1, 0.2, 0.3, 1.0]);
        assert_eq!(&vertices[6..12], &[10.0, 0.0, 0.1, 0.2, 0.3, 1.0]);
    }

    #[test]
    fn rejects_concave_polygon_for_triangle_fan_backend() {
        let error = build_convex_polygon_vertices(
            &[0.0, 0.0, 4.0, 0.0, 2.0, 1.0, 4.0, 4.0, 0.0, 4.0],
            &[0, 10],
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            &[1.0, 1.0, 1.0, 1.0],
            100,
            100,
        )
        .expect_err("concave polygon must fail closed");

        assert!(error.contains("not a non-degenerate convex polygon"));
    }
}
