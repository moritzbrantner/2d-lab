#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
use wasm_bindgen::prelude::*;

#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod retained_webgpu;
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod vello_gpu_renderer;
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod webgpu;

// Target-independent GPU cores shared by the browser renderers and the native oracle (`oracle/`,
// which enables the `native` feature).
#[cfg(any(all(target_arch = "wasm32", target_os = "unknown"), feature = "native"))]
pub mod polygon_pipeline;
#[cfg(any(all(target_arch = "wasm32", target_os = "unknown"), feature = "native"))]
pub mod vello_scene;
#[cfg(any(all(target_arch = "wasm32", target_os = "unknown"), feature = "native"))]
pub use {vello_gpu, wgpu};

const CONVEX_EPSILON: f32 = 1.0e-5;
/// Floats per custom immediate-path vertex (`CoveragePolygons::vertices`).
pub const GPU_VERTEX_FLOATS: usize = 8;

#[cfg_attr(all(target_arch = "wasm32", target_os = "unknown"), wasm_bindgen)]
pub fn transform_batches(points: &[f32], spans: &[u32], transforms: &[f32]) -> Vec<f32> {
    assert_eq!(spans.len() % 2, 0, "spans must contain start/length pairs");

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
        assert!(
            start + len <= points.len(),
            "point span exceeds point buffer"
        );

        let matrix_offset = command_index * 6;
        let transform = &transforms[matrix_offset..matrix_offset + 6];

        for point_offset in (start..start + len).step_by(2) {
            let (x, y) = transform_point(points[point_offset], points[point_offset + 1], transform);
            output[point_offset] = x;
            output[point_offset + 1] = y;
        }
    }

    output
}

/// The custom immediate path's anti-aliased geometry for one frame.
///
/// Each convex polygon is transformed to screen space and grown outward by `COVERAGE_MARGIN`
/// pixels so every pixel it partly covers is rasterized; the fragment shader then computes each
/// pixel's analytic box-filter area coverage from the polygon's original edges (`edges`), as
/// Vello and Skia do, instead of the aliased centre-sample test of a bare triangle fan.
#[derive(Debug, Default, PartialEq)]
pub struct CoveragePolygons {
    /// Triangle-list vertices, `GPU_VERTEX_FLOATS` each: clip-space x/y, sRGB RGBA (straight
    /// alpha), then the polygon's first edge index and edge count (small integers as `f32`).
    pub vertices: Vec<f32>,
    /// Edge lines, 4 floats each: unit inward normal x/y and offset, so the signed distance (in
    /// pixels, positive inside) of framebuffer point `p` is `n·p + offset`; then padding.
    pub edges: Vec<f32>,
}

impl CoveragePolygons {
    pub fn vertex_count(&self) -> usize {
        self.vertices.len() / GPU_VERTEX_FLOATS
    }
}

/// How far (pixels) each polygon grows before rasterization: a pixel with any coverage has its
/// centre within half a pixel diagonal (≈ 0.71) of the polygon.
const COVERAGE_MARGIN: f32 = 1.0;
/// Screen-space points closer than this (pixels) are one point; consecutive edges whose
/// directions differ by less than this sine are one edge.
const SCREEN_EPSILON: f32 = 1.0e-4;

pub fn build_coverage_polygons(
    points: &[f32],
    spans: &[u32],
    transforms: &[f32],
    colors: &[f32],
    width: u32,
    height: u32,
) -> Result<CoveragePolygons, String> {
    if width == 0 || height == 0 {
        return Err("render extent must be non-zero".into());
    }
    validate_polygon_arrays(points, spans, colors)?;

    let command_count = spans.len() / 2;
    if transforms.len() != command_count * 6 {
        return Err("each command must provide one affine transform".into());
    }

    let mut output = CoveragePolygons::default();
    let width = width as f32;
    let height = height as f32;
    let mut screen = Vec::new();

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

        screen.clear();
        for pair in polygon.as_chunks::<2>().0 {
            let (x, y) = transform_point(pair[0], pair[1], transform);
            if !x.is_finite() || !y.is_finite() {
                return Err("transformed polygon coordinate is non-finite".into());
            }
            screen.push((x, y));
        }
        simplify_screen_polygon(&mut screen);
        if screen.len() < 3 {
            // Collapsed to a point or a line by its transform: covers nothing, as in Vello/Skia.
            continue;
        }

        let color = &colors[command_index * 4..command_index * 4 + 4];
        append_coverage_polygon(&mut output, &screen, color, width, height)?;
    }

    Ok(output)
}

/// Drops repeated points and collinear vertices so every remaining edge is a distinct line (a
/// repeated edge would apply its coverage twice).
fn simplify_screen_polygon(screen: &mut Vec<(f32, f32)>) {
    let mut index = 0;
    while screen.len() >= 3 && index < screen.len() {
        let count = screen.len();
        let prev = screen[(index + count - 1) % count];
        let here = screen[index];
        let next = screen[(index + 1) % count];
        let (ax, ay) = (here.0 - prev.0, here.1 - prev.1);
        let (bx, by) = (next.0 - here.0, next.1 - here.1);
        let (la, lb) = (ax.hypot(ay), bx.hypot(by));
        let redundant = la <= SCREEN_EPSILON
            || (lb > SCREEN_EPSILON && ((ax * by - ay * bx) / (la * lb)).abs() <= SCREEN_EPSILON);
        if redundant {
            screen.remove(index);
            index = index.saturating_sub(1);
        } else {
            index += 1;
        }
    }
}

fn append_coverage_polygon(
    output: &mut CoveragePolygons,
    screen: &[(f32, f32)],
    color: &[f32],
    width: f32,
    height: f32,
) -> Result<(), String> {
    let count = screen.len();
    let twice_area: f32 = (0..count)
        .map(|i| {
            let (a, b) = (screen[i], screen[(i + 1) % count]);
            a.0 * b.1 - a.1 * b.0
        })
        .sum();
    // For positive area in y-down screen space, (-dy, dx) points into the polygon.
    let orientation = twice_area.signum();

    let edge_start = (output.edges.len() / 4) as f32;
    let mut normals = Vec::with_capacity(count);
    for i in 0..count {
        let (a, b) = (screen[i], screen[(i + 1) % count]);
        let (dx, dy) = (b.0 - a.0, b.1 - a.1);
        let length = dx.hypot(dy);
        let (nx, ny) = (-dy / length * orientation, dx / length * orientation);
        normals.push((nx, ny));
        output
            .edges
            .extend_from_slice(&[nx, ny, -(nx * a.0 + ny * a.1), 0.0]);
    }

    // Grow outward: each vertex moves to the intersection of its two edges' offset lines.
    let mut grown = Vec::with_capacity(count);
    for i in 0..count {
        let (n0, n1) = (normals[(i + count - 1) % count], normals[i]);
        let scale = COVERAGE_MARGIN / (1.0 + n0.0 * n1.0 + n0.1 * n1.1).max(1.0e-3);
        let x = screen[i].0 - (n0.0 + n1.0) * scale;
        let y = screen[i].1 - (n0.1 + n1.1) * scale;
        let clip = (x / width * 2.0 - 1.0, 1.0 - y / height * 2.0);
        if !clip.0.is_finite() || !clip.1.is_finite() {
            return Err("polygon coordinate is not representable in clip space".into());
        }
        grown.push(clip);
    }

    let edge_count = count as f32;
    output.vertices.reserve((count - 2) * 3 * GPU_VERTEX_FLOATS);
    for triangle in 1..count - 1 {
        for index in [0, triangle, triangle + 1] {
            let (x, y) = grown[index];
            output.vertices.extend_from_slice(&[
                x, y, color[0], color[1], color[2], color[3], edge_start, edge_count,
            ]);
        }
    }
    Ok(())
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

fn validate_polygon_arrays(points: &[f32], spans: &[u32], colors: &[f32]) -> Result<(), String> {
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
            return Err(format!("command {command_index} has an invalid RGBA color"));
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
        return Err(format!(
            "command {command_index} has an invalid polygon span"
        ));
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
    output.reserve((point_count - 2) * 3 * 6); // x/y + RGBA per vertex

    for triangle_index in 1..point_count - 1 {
        for point_index in [0, triangle_index, triangle_index + 1] {
            let point_offset = start + point_index * 2;
            let (x, y) = map(points[point_offset], points[point_offset + 1])?;
            output.extend_from_slice(&[x, y, color[0], color[1], color[2], color[3]]);
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
        CoveragePolygons, build_coverage_polygons, build_local_convex_polygon_vertices,
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

        assert_eq!(actual, vec![10.0, 20.0, 12.0, 20.0, 1.0, 7.0, 5.0, 10.0]);
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
    fn grows_quads_by_the_coverage_margin_and_keeps_their_edges() {
        let geometry = build_coverage_polygons(
            &[10.0, 10.0, 90.0, 10.0, 90.0, 90.0, 10.0, 90.0],
            &[0, 8],
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            &[0.25, 0.5, 0.75, 1.0],
            100,
            100,
        )
        .expect("convex quad should triangulate");

        assert_eq!(geometry.vertex_count(), 6);
        // (9, 9) and (91, 9) in clip space, carrying the polygon's 4 edges from index 0.
        let close = |actual: &[f32], expected: &[f32]| {
            assert!(
                actual
                    .iter()
                    .zip(expected)
                    .all(|(a, e)| (a - e).abs() < 1e-6),
                "{actual:?} != {expected:?}"
            );
        };
        close(
            &geometry.vertices[0..8],
            &[-0.82, 0.82, 0.25, 0.5, 0.75, 1.0, 0.0, 4.0],
        );
        close(
            &geometry.vertices[8..16],
            &[0.82, 0.82, 0.25, 0.5, 0.75, 1.0, 0.0, 4.0],
        );
        // Top edge y = 10, inward normal pointing down (+y).
        assert_eq!(&geometry.edges[0..4], &[0.0, 1.0, -10.0, 0.0]);
        assert_eq!(geometry.edges.len(), 4 * 4);
    }

    #[test]
    fn mirrored_polygons_keep_inward_normals_and_merge_collinear_points() {
        let geometry = build_coverage_polygons(
            &[0.0, 0.0, 5.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
            &[0, 10],
            &[-1.0, 0.0, 0.0, 1.0, 50.0, 20.0],
            &[1.0, 1.0, 1.0, 1.0],
            100,
            100,
        )
        .expect("mirrored quad should triangulate");

        assert_eq!(geometry.edges.len(), 4 * 4);
        for edge in geometry.edges.as_chunks::<4>().0 {
            // The centre (45, 25) is 5 px inside every edge.
            assert!((edge[0] * 45.0 + edge[1] * 25.0 + edge[2] - 5.0).abs() < 1e-4);
        }
    }

    #[test]
    fn collapsed_polygons_draw_nothing() {
        let geometry = build_coverage_polygons(
            &[0.0, 0.0, 10.0, 0.0, 10.0, 10.0],
            &[0, 6],
            &[1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            &[1.0, 1.0, 1.0, 1.0],
            100,
            100,
        )
        .expect("a collapsed polygon is valid input");

        assert_eq!(geometry, CoveragePolygons::default());
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
        let error = build_coverage_polygons(
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
