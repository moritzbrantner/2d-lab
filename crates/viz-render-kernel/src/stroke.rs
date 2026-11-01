//! Canvas 2D strokes for the custom immediate path, tessellated with lyon.
//!
//! lyon's stroke tessellator turns a polyline (in the command's local space, so the width is in
//! user space under its transform) into a triangle mesh with Canvas caps, joins and miter limit.
//! Its triangles tile the stroke, so a translucent stroke covers each pixel once. To anti-alias
//! the stroke outline like Vello and Skia, the mesh is merged back into convex pieces and each
//! piece edge is classified:
//!
//! - an edge with a triangle on only one side is on the stroke **outline** and gets analytic area
//!   coverage;
//! - an edge with triangles on both sides is **internal**: a hard pixel-centre test, so the pieces
//!   on either side split its pixels exactly once (no seam, no double blend).

use std::collections::{HashMap, HashSet};

use lyon_tessellation::{
    BuffersBuilder, LineCap, LineJoin, StrokeOptions, StrokeTessellator, StrokeVertex,
    VertexBuffers, math::Point, path::polygon::Polygon,
};

use crate::{CoveragePolygons, append_coverage_polygon, transform_point};

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

/// Maximum distance (screen pixels) between a round cap/join and its flattened polygon.
const STROKE_TOLERANCE: f32 = 0.1;
/// Corners whose turn is within this (normalized cross product) are straight.
const COLLINEAR_EPSILON: f32 = 1.0e-5;

pub struct StrokeStyle {
    pub width: f32,
    pub cap: Cap,
    pub join: Join,
    pub miter_limit: f32,
}

/// Reusable buffers for `append_stroke`.
#[derive(Default)]
pub struct StrokeScratch {
    tessellator: Option<StrokeTessellator>,
    local: Vec<Point>,
    mesh: VertexBuffers<Point, u32>,
    canonical: HashMap<(u32, u32), u32>,
    /// Directed triangle edges (positive orientation).
    edges: HashSet<(u32, u32)>,
    screen: Vec<(f32, f32)>,
    triangles: Vec<[u32; 3]>,
    piece: Vec<u32>,
    corners: Vec<(f32, f32)>,
    hard: Vec<bool>,
}

/// Strokes the local-space polyline `points` (x/y pairs) and appends its anti-aliased pieces.
#[allow(clippy::too_many_arguments)]
pub(crate) fn append_stroke(
    output: &mut CoveragePolygons,
    scratch: &mut StrokeScratch,
    points: &[f32],
    closed: bool,
    transform: &[f32],
    style: &StrokeStyle,
    color: &[f32],
    width: f32,
    height: f32,
) -> Result<(), String> {
    let scale = (transform[0].hypot(transform[1])).max(transform[2].hypot(transform[3]));
    if scale <= 0.0 {
        return Ok(()); // Collapsed by its transform: covers nothing.
    }

    let s = scratch;
    s.local.clear();
    s.local.extend(
        points
            .as_chunks::<2>()
            .0
            .iter()
            .map(|p| Point::new(p[0], p[1])),
    );
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
        .tessellate_polygon(
            Polygon {
                points: &s.local,
                closed,
            },
            &options,
            &mut BuffersBuilder::new(&mut s.mesh, |vertex: StrokeVertex| vertex.position()),
        )
        .map_err(|error| format!("stroke tessellation failed: {error:?}"))?;

    // lyon may emit one position as several vertices (e.g. where a closed path meets itself);
    // identify vertices by their exact local position so shared edges are found.
    s.canonical.clear();
    s.screen.clear();
    let mut remap = Vec::with_capacity(s.mesh.vertices.len());
    for vertex in &s.mesh.vertices {
        let key = (vertex.x.to_bits(), vertex.y.to_bits());
        let next = s.screen.len() as u32;
        let index = *s.canonical.entry(key).or_insert(next);
        if index == next {
            let (x, y) = transform_point(vertex.x, vertex.y, transform);
            if !x.is_finite() || !y.is_finite() {
                return Err("transformed stroke coordinate is non-finite".into());
            }
            s.screen.push((x, y));
        }
        remap.push(index);
    }

    s.triangles.clear();
    s.edges.clear();
    for triangle in s.mesh.indices.as_chunks::<3>().0 {
        let [a, b, c] = triangle.map(|index| remap[index as usize]);
        let area = cross(
            s.screen[a as usize],
            s.screen[b as usize],
            s.screen[c as usize],
        );
        if a == b || b == c || c == a || area == 0.0 {
            continue;
        }
        // Positive orientation throughout, so a shared edge runs in opposite directions.
        let triangle = if area > 0.0 { [a, b, c] } else { [a, c, b] };
        for i in 0..3 {
            s.edges.insert((triangle[i], triangle[(i + 1) % 3]));
        }
        s.triangles.push(triangle);
    }

    // Greedily merge consecutive triangles (lyon emits each segment body, join and cap as a
    // run of adjacent triangles) into convex pieces.
    s.piece.clear();
    for t in 0..s.triangles.len() {
        let triangle = s.triangles[t];
        if !s.piece.is_empty() && merge(&mut s.piece, triangle, &s.screen, &s.edges) {
            continue;
        }
        if !s.piece.is_empty() {
            emit(output, s, color, width, height)?;
        }
        s.piece.clear();
        s.piece.extend_from_slice(&triangle);
    }
    if !s.piece.is_empty() {
        emit(output, s, color, width, height)?;
    }
    Ok(())
}

/// lyon 1.0 bevels a miter join when its join-point-to-tip length exceeds `limit × width`, half
/// the Canvas/SVG ratio (inner corner to tip, `1 / sin(θ / 2)`), so the Canvas limit is halved.
/// lyon cannot express a Canvas limit in (1, 2); those clamp to lyon's minimum (ratio 2).
fn lyon_miter_limit(canvas_limit: f32) -> f32 {
    (canvas_limit * 0.5).max(StrokeOptions::MINIMUM_MITER_LIMIT)
}

fn cross(a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> f32 {
    (b.0 - a.0) * (c.1 - b.1) - (b.1 - a.1) * (c.0 - b.0)
}

/// Whether the directed piece edge `a → b` is shared with a triangle on its other side (which runs
/// it `b → a`). Overlapping triangles that run it the same way leave it on the outline.
fn internal(edges: &HashSet<(u32, u32)>, a: u32, b: u32) -> bool {
    edges.contains(&(b, a))
}

/// Whether the corner `a → b → c` keeps a positively oriented piece convex. A straight corner is
/// allowed only between edges of one kind (it is then dropped, joining them into one edge).
fn convex_corner(
    a: u32,
    b: u32,
    c: u32,
    screen: &[(f32, f32)],
    edges: &HashSet<(u32, u32)>,
) -> bool {
    let (pa, pb, pc) = (screen[a as usize], screen[b as usize], screen[c as usize]);
    let turn = cross(pa, pb, pc);
    let scale = (pb.0 - pa.0).hypot(pb.1 - pa.1) * (pc.0 - pb.0).hypot(pc.1 - pb.1);
    if turn > COLLINEAR_EPSILON * scale {
        return true;
    }
    turn >= -COLLINEAR_EPSILON * scale && internal(edges, a, b) == internal(edges, b, c)
}

/// Adds `triangle` to the convex `piece` when they share an edge and the union stays convex.
fn merge(
    piece: &mut Vec<u32>,
    triangle: [u32; 3],
    screen: &[(f32, f32)],
    edges: &HashSet<(u32, u32)>,
) -> bool {
    let n = piece.len();
    for i in 0..3 {
        let (u, v, w) = (triangle[i], triangle[(i + 1) % 3], triangle[(i + 2) % 3]);
        if piece.contains(&w) {
            continue;
        }
        // The piece runs the shared edge as v → u; insert w between them.
        let Some(at) = (0..n).find(|&j| piece[j] == v && piece[(j + 1) % n] == u) else {
            continue;
        };
        let before = piece[(at + n - 1) % n];
        let after = piece[(at + 2) % n];
        if convex_corner(before, v, w, screen, edges)
            && convex_corner(v, w, u, screen, edges)
            && convex_corner(w, u, after, screen, edges)
        {
            piece.insert(at + 1, w);
            return true;
        }
    }
    false
}

fn emit(
    output: &mut CoveragePolygons,
    s: &mut StrokeScratch,
    color: &[f32],
    width: f32,
    height: f32,
) -> Result<(), String> {
    // Drop straight corners (merged edges of one kind) so no line applies its coverage twice.
    let piece = &mut s.piece;
    let mut index = 0;
    while piece.len() > 3 && index < piece.len() {
        let n = piece.len();
        let (a, b, c) = (
            piece[(index + n - 1) % n],
            piece[index],
            piece[(index + 1) % n],
        );
        let (pa, pb, pc) = (
            s.screen[a as usize],
            s.screen[b as usize],
            s.screen[c as usize],
        );
        let scale = (pb.0 - pa.0).hypot(pb.1 - pa.1) * (pc.0 - pb.0).hypot(pc.1 - pb.1);
        if cross(pa, pb, pc).abs() <= COLLINEAR_EPSILON * scale {
            piece.remove(index);
        } else {
            index += 1;
        }
    }

    s.corners.clear();
    s.hard.clear();
    let n = piece.len();
    for i in 0..n {
        let (a, b) = (piece[i], piece[(i + 1) % n]);
        s.corners.push(s.screen[a as usize]);
        s.hard.push(internal(&s.edges, a, b));
    }
    append_coverage_polygon(output, &s.corners, &s.hard, color, width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stroke(points: &[f32], closed: bool, style: StrokeStyle) -> CoveragePolygons {
        let mut output = CoveragePolygons::default();
        append_stroke(
            &mut output,
            &mut StrokeScratch::default(),
            points,
            closed,
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            &style,
            &[0.0, 0.0, 0.0, 1.0],
            100.0,
            100.0,
        )
        .expect("stroke should tessellate");
        output
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
        let hard = geometry
            .edges
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|e| e[3] != 0.0)
            .count();
        (geometry.edges.len() / 4 - hard, hard)
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
            .filter(|e| e[3] != 0.0)
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
    fn flags_decode_canvas_styles() {
        let flags = (CAP_SQUARE << CAP_SHIFT) | (JOIN_BEVEL << JOIN_SHIFT) | 4;
        assert_eq!(stroke_cap(flags), Ok(Cap::Square));
        assert_eq!(stroke_join(flags), Ok(Join::Bevel));
        assert!(stroke_cap(3 << CAP_SHIFT).is_err());
    }
}
