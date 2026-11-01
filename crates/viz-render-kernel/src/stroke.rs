//! Canvas 2D strokes for the custom immediate path, tessellated with lyon.
//!
//! lyon's stroke tessellator turns a path (in the command's local space, so the width is in user
//! space under its transform; cubic segments flatten to `STROKE_TOLERANCE` screen pixels) into a
//! triangle mesh with Canvas caps, joins and miter limit. `mesh.rs` merges it into anti-aliased
//! convex pieces.

use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillRule, FillTessellator, FillVertex, LineCap, LineJoin,
    StrokeOptions, StrokeTessellator, StrokeVertex, VertexBuffers, math::Point, path::Path,
};

use crate::{
    CoveragePolygons,
    mesh::{MeshScratch, append_mesh},
};

/// `flags` bits 3–4: line cap (Canvas `lineCap`).
pub const CAP_SHIFT: u32 = 3;
/// `flags` bits 5–6: line join (Canvas `lineJoin`).
pub const JOIN_SHIFT: u32 = 5;
pub const CAP_BUTT: u32 = 0;
pub const CAP_ROUND: u32 = 1;
pub const CAP_SQUARE: u32 = 2;
pub const JOIN_MITER: u32 = 0;
pub const JOIN_ROUND: u32 = 1;
pub const JOIN_BEVEL: u32 = 2;

/// Canvas stroke style of one command, decoded from its `flags`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cap {
    Butt,
    Round,
    Square,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Join {
    Miter,
    Round,
    Bevel,
}

pub fn stroke_cap(flags: u32) -> Result<Cap, String> {
    match (flags >> CAP_SHIFT) & 3 {
        CAP_BUTT => Ok(Cap::Butt),
        CAP_ROUND => Ok(Cap::Round),
        CAP_SQUARE => Ok(Cap::Square),
        _ => Err("unknown line cap".into()),
    }
}

pub fn stroke_join(flags: u32) -> Result<Join, String> {
    match (flags >> JOIN_SHIFT) & 3 {
        JOIN_MITER => Ok(Join::Miter),
        JOIN_ROUND => Ok(Join::Round),
        JOIN_BEVEL => Ok(Join::Bevel),
        _ => Err("unknown line join".into()),
    }
}

/// Maximum distance (screen pixels) between a curve, round cap or round join and its flattened
/// polygon. Vello and Skia flatten to 0.25 px; a tighter tolerance stays nearer the true curve
/// both of them approximate.
pub const STROKE_TOLERANCE: f32 = 0.1;

pub struct StrokeStyle {
    pub width: f32,
    pub cap: Cap,
    pub join: Join,
    pub miter_limit: f32,
}

/// Reusable buffers for `append_stroke`.
#[derive(Default)]
pub(crate) struct StrokeScratch {
    tessellator: Option<StrokeTessellator>,
    fill: Option<FillTessellator>,
    mesh: VertexBuffers<Point, u32>,
}

/// Strokes the local-space `path` and appends its anti-aliased pieces.
#[allow(clippy::too_many_arguments)]
pub(crate) fn append_stroke(
    output: &mut CoveragePolygons,
    scratch: &mut StrokeScratch,
    pieces: &mut MeshScratch,
    path: &Path,
    transform: &[f32],
    style: &StrokeStyle,
    color: &[f32],
    width: f32,
    height: f32,
) -> Result<(), String> {
    let scale = crate::transform_scale(transform);
    if scale <= 0.0 {
        return Ok(()); // Collapsed by its transform: covers nothing.
    }

    let s = scratch;
    s.mesh.vertices.clear();
    s.mesh.indices.clear();
    let options = StrokeOptions::default()
        .with_line_width(style.width)
        .with_line_cap(match style.cap {
            Cap::Butt => LineCap::Butt,
            Cap::Round => LineCap::Round,
            Cap::Square => LineCap::Square,
        })
        .with_line_join(match style.join {
            // Every join's miter ratio is at least 1, so a Canvas limit ≤ 1 bevels them all.
            Join::Miter if style.miter_limit <= 1.0 => LineJoin::Bevel,
            Join::Miter => LineJoin::Miter,
            Join::Round => LineJoin::Round,
            Join::Bevel => LineJoin::Bevel,
        })
        .with_miter_limit(lyon_miter_limit(style.miter_limit))
        .with_tolerance(STROKE_TOLERANCE / scale);
    s.tessellator
        .get_or_insert_with(StrokeTessellator::new)
        .tessellate_path(
            path,
            &options,
            &mut BuffersBuilder::new(&mut s.mesh, |vertex: StrokeVertex| vertex.position()),
        )
        .map_err(|error| format!("stroke tessellation failed: {error:?}"))?;
    if color[3] < 1.0 {
        union_mesh(s)?;
    }
    append_mesh(
        output,
        pieces,
        &s.mesh.vertices,
        &s.mesh.indices,
        transform,
        color,
        width,
        height,
    )
}

/// Replaces the stroke mesh with its union (#61). lyon does not resolve a stroke's
/// self-intersections: where the path crosses or folds over itself (a loop, a figure-eight, a sharp
/// hairpin) its triangles overlap and a translucent paint would blend twice. Canvas, Vello and
/// Skia stroke with nonzero coverage, so the triangles, all wound the same way, are filled again
/// with lyon's fill tessellator under the nonzero rule, which tiles every covered point once.
/// An opaque paint looks the same either way and keeps the stroke mesh.
fn union_mesh(s: &mut StrokeScratch) -> Result<(), String> {
    let mut builder = Path::builder();
    for triangle in s.mesh.indices.as_chunks::<3>().0 {
        let [a, b, c] = triangle.map(|index| s.mesh.vertices[index as usize]);
        let area = (b - a).cross(c - a);
        if area == 0.0 {
            continue;
        }
        let (b, c) = if area > 0.0 { (b, c) } else { (c, b) };
        builder.begin(a);
        builder.line_to(b);
        builder.line_to(c);
        builder.end(true);
    }
    let triangles = builder.build();
    s.mesh.vertices.clear();
    s.mesh.indices.clear();
    s.fill
        .get_or_insert_with(FillTessellator::new)
        .tessellate_path(
            &triangles,
            &FillOptions::default().with_fill_rule(FillRule::NonZero),
            &mut BuffersBuilder::new(&mut s.mesh, |vertex: FillVertex| vertex.position()),
        )
        .map_err(|error| format!("stroke union failed: {error:?}"))
}

/// lyon 1.0 bevels a miter join when its join-point-to-tip length exceeds `limit × width`, half
/// the Canvas/SVG ratio (inner corner to tip, `1 / sin(θ / 2)`), so the Canvas limit is halved.
/// lyon cannot express a Canvas limit in (1, 2); those clamp to lyon's minimum (ratio 2).
fn lyon_miter_limit(canvas_limit: f32) -> f32 {
    (canvas_limit * 0.5).max(StrokeOptions::MINIMUM_MITER_LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stroke(points: &[f32], closed: bool, style: StrokeStyle) -> CoveragePolygons {
        stroke_with_alpha(points, closed, style, 1.0)
    }

    fn stroke_with_alpha(
        points: &[f32],
        closed: bool,
        style: StrokeStyle,
        alpha: f32,
    ) -> CoveragePolygons {
        let mut output = CoveragePolygons::default();
        let verbs = vec![crate::VERB_LINE; points.len() / 2 - 1];
        let path = crate::local_path(points, &verbs, closed).expect("valid polyline");
        append_stroke(
            &mut output,
            &mut StrokeScratch::default(),
            &mut MeshScratch::default(),
            &path,
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            &style,
            &[0.0, 0.0, 0.0, alpha],
            100.0,
            100.0,
        )
        .expect("stroke should tessellate");
        output
    }

    /// Pieces whose edges all hold the point `(x, y)` (a pixel centre well inside the stroke).
    fn pieces_covering(geometry: &CoveragePolygons, x: f32, y: f32) -> usize {
        let mut ranges: Vec<(usize, usize)> = geometry
            .vertices
            .as_chunks::<{ crate::GPU_VERTEX_FLOATS }>()
            .0
            .iter()
            .map(|v| (v[6] as usize, v[7] as usize))
            .collect();
        ranges.dedup();
        ranges
            .iter()
            .filter(|&&(first, count)| {
                geometry.edges.as_chunks::<4>().0[first..first + count]
                    .iter()
                    .all(|e| e[3] == 2.0 || e[0] * x + e[1] * y + e[2] > 0.0)
            })
            .count()
    }

    #[test]
    fn a_translucent_self_crossing_stroke_covers_its_crossing_once() {
        // An open "X" crossing itself at (50, 50), and a sharp hairpin whose arms overlap.
        let cross = [10.0, 10.0, 90.0, 90.0, 90.0, 10.0, 10.0, 90.0];
        let hairpin = [5.0, 40.0, 35.0, 42.0, 5.0, 44.0];
        for (points, x, y) in [(&cross[..], 50.1, 50.2), (&hairpin[..], 20.1, 42.2)] {
            let opaque = stroke(points, false, canvas(6.0));
            assert_eq!(
                pieces_covering(&opaque, x, y),
                2,
                "lyon's stroke mesh overlaps"
            );
            let translucent = stroke_with_alpha(points, false, canvas(6.0), 0.5);
            assert_eq!(pieces_covering(&translucent, x, y), 1);
        }
    }

    fn canvas(width: f32) -> StrokeStyle {
        StrokeStyle {
            width,
            cap: Cap::Butt,
            join: Join::Miter,
            miter_limit: 10.0,
        }
    }

    /// (outline, internal) edge counts.
    fn edge_kinds(geometry: &CoveragePolygons) -> (usize, usize) {
        let kind = |k: f32| {
            geometry
                .edges
                .as_chunks::<4>()
                .0
                .iter()
                .filter(|e| e[3] == k)
                .count()
        };
        (kind(0.0), kind(1.0))
    }

    #[test]
    fn a_butt_line_is_one_anti_aliased_quad() {
        let geometry = stroke(&[10.0, 50.0, 90.0, 50.0], false, canvas(2.0));
        assert_eq!(geometry.vertex_count(), 6);
        assert_eq!(edge_kinds(&geometry), (4, 0));
    }

    #[test]
    fn a_miter_join_splits_two_pieces_along_one_hard_edge() {
        let geometry = stroke(&[10.0, 10.0, 50.0, 10.0, 50.0, 50.0], false, canvas(4.0));
        // Two quads; the shared bisector is hard on both sides with exactly negated lines.
        assert_eq!(edge_kinds(&geometry), (6, 2));
        let hard: Vec<_> = geometry
            .edges
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|e| e[3] == 1.0)
            .collect();
        assert_eq!(hard[0][0], -hard[1][0]);
        assert_eq!(hard[0][1], -hard[1][1]);
        assert_eq!(hard[0][2], -hard[1][2]);
    }

    #[test]
    fn a_closed_square_has_no_caps() {
        let geometry = stroke(
            &[10.0, 10.0, 50.0, 10.0, 50.0, 50.0, 10.0, 50.0],
            true,
            canvas(2.0),
        );
        // Four mitered sides, each with an outer and inner outline edge and two hard ends.
        assert_eq!(edge_kinds(&geometry), (8, 8));
    }

    #[test]
    fn round_and_square_caps_extend_past_the_endpoints() {
        for cap in [Cap::Round, Cap::Square] {
            let geometry = stroke(
                &[10.0, 50.0, 90.0, 50.0],
                false,
                StrokeStyle { cap, ..canvas(4.0) },
            );
            // The outline reaches 2 px beyond x = 10: some outline edge's line passes x ≈ 8.
            let reaches = geometry.edges.as_chunks::<4>().0.iter().any(|e| {
                e[3] == 0.0 && e[0] > 0.9 && (e[0] * 8.0 + e[1] * 50.0 + e[2]).abs() < 0.05
            });
            assert!(reaches, "{cap:?} cap does not extend the stroke");
        }
    }

    #[test]
    fn the_miter_limit_has_canvas_meaning() {
        // Turn with miter ratio 1 / sin(atan(9 / 110)) ≈ 12.3: bevelled at Canvas's default 10,
        // mitred at 40 with the tip ≈ 2.5 × 12.3 px past the join at x = 110.
        let max_x = |miter_limit| {
            let geometry = stroke(
                &[0.0, 0.0, 110.0, 9.0, 0.0, 18.0],
                false,
                StrokeStyle {
                    miter_limit,
                    ..canvas(5.0)
                },
            );
            geometry
                .vertices
                .as_chunks::<8>()
                .0
                .iter()
                .map(|v| (v[0] + 1.0) * 50.0)
                .fold(f32::MIN, f32::max)
        };
        assert!(max_x(10.0) < 128.0, "bevel reaches {}", max_x(10.0));
        assert!(max_x(40.0) > 135.0, "miter reaches {}", max_x(40.0));
    }

    #[test]
    fn a_sharp_bevel_limits_its_hard_edge_past_the_inner_corner() {
        // A 9.4° turn bevelled at the default limit: lyon's edge from the bevel to the inner
        // corner runs on, past that corner, almost along the other arm's inner outline (#61).
        let geometry = stroke(&[0.0, 0.0, 110.0, 9.0, 0.0, 18.0], false, canvas(5.0));
        let limits: Vec<_> = geometry
            .edges
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|e| e[3] == 2.0)
            .collect();
        // The hard edges ending there each carry one record on either side, identical, at the
        // inner corner (≈ 79.3, 9), pointing away from the bevel.
        assert!(!limits.is_empty() && limits.len() % 2 == 0);
        for limit in &limits {
            assert_eq!(limits.iter().filter(|other| *other == limit).count() % 2, 0);
            assert!(limit[0] < -0.99);
            assert!((limit[0] * 79.3 + limit[1] * 9.0 + limit[2]).abs() < 0.1);
        }
    }

    #[test]
    fn flags_decode_canvas_styles() {
        let flags = (CAP_SQUARE << CAP_SHIFT) | (JOIN_BEVEL << JOIN_SHIFT) | 4;
        assert_eq!(stroke_cap(flags), Ok(Cap::Square));
        assert_eq!(stroke_join(flags), Ok(Join::Bevel));
        assert!(stroke_cap(3 << CAP_SHIFT).is_err());
    }
}
