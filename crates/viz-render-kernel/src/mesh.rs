//! lyon triangle meshes (fills and strokes) as anti-aliased convex pieces.
//!
//! lyon's tessellators tile a path's covered area with triangles, so a translucent paint covers
//! each pixel once. To anti-alias the outline like Vello and Skia, the mesh is merged back into
//! convex pieces and each piece edge is classified:
//!
//! - an edge with a triangle on only one side is on the **outline** and gets analytic area
//!   coverage;
//! - an edge with triangles on both sides is **internal**: a hard pixel-centre test, so the pieces
//!   on either side split its pixels exactly once (no seam, no double blend).
//!
//! A hard edge is an infinite line in the shader. Where one ends at a **reflex** outline corner and
//! its extension runs on almost along an outline edge there (a sharp bevel's inner corner, #61),
//! that line would cut the outline's anti-aliased pixels, so the edge carries a limit past which
//! its hard test is dropped.

use std::collections::{HashMap, HashSet};

use lyon_tessellation::math::Point;

use crate::{CoveragePolygons, append_coverage_polygon, transform_point};

/// Corners whose turn is within this (normalized cross product) are straight.
const COLLINEAR_EPSILON: f32 = 1.0e-5;
/// A hard edge's extension past a reflex corner runs "along" an outline edge there when the cosine
/// of the angle between them exceeds this (15°).
const LIMIT_ALIGNMENT: f32 = 0.966;
/// A merged corner between an outline edge and a hard edge turns by more than this sine (≈ 6°).
const MIXED_CORNER_SINE: f32 = 0.1;

/// Reusable buffers for `append_mesh`.
#[derive(Default)]
pub(crate) struct MeshScratch {
    canonical: HashMap<(u32, u32), u32>,
    remap: Vec<u32>,
    /// Directed triangle edges (positive orientation).
    edges: HashSet<(u32, u32)>,
    screen: Vec<(f32, f32)>,
    triangles: Vec<[u32; 3]>,
    /// The two outline neighbours of each reflex outline corner.
    reflex: HashMap<u32, [u32; 2]>,
    outline_out: HashMap<u32, u32>,
    outline_in: HashMap<u32, u32>,
    piece: Vec<u32>,
    corners: Vec<(f32, f32)>,
    hard: Vec<bool>,
    limits: Vec<Option<[f32; 4]>>,
}

/// Appends the anti-aliased convex pieces of the local-space triangle mesh `vertices`/`indices`
/// under `transform`.
#[allow(clippy::too_many_arguments)]
pub(crate) fn append_mesh(
    output: &mut CoveragePolygons,
    s: &mut MeshScratch,
    vertices: &[Point],
    indices: &[u32],
    transform: &[f32],
    color: &[f32],
    width: f32,
    height: f32,
) -> Result<(), String> {
    // lyon may emit one position as several vertices (e.g. where a closed path meets itself);
    // identify vertices by their exact local position so shared edges are found.
    s.canonical.clear();
    s.screen.clear();
    s.remap.clear();
    for vertex in vertices {
        let key = (vertex.x.to_bits(), vertex.y.to_bits());
        let next = s.screen.len() as u32;
        let index = *s.canonical.entry(key).or_insert(next);
        if index == next {
            let (x, y) = transform_point(vertex.x, vertex.y, transform);
            if !x.is_finite() || !y.is_finite() {
                return Err("transformed path coordinate is non-finite".into());
            }
            s.screen.push((x, y));
        }
        s.remap.push(index);
    }

    s.triangles.clear();
    s.edges.clear();
    for triangle in indices.as_chunks::<3>().0 {
        let [a, b, c] = triangle.map(|index| s.remap[index as usize]);
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

    reflex_corners(s);

    // Greedily merge consecutive triangles (lyon emits runs of adjacent triangles: a stroke
    // segment body, join or cap; a monotone span of a fill) into convex pieces.
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

/// Finds the reflex outline corners (one outline edge in, one out, turning outward) and their
/// outline neighbours.
fn reflex_corners(s: &mut MeshScratch) {
    s.outline_out.clear();
    s.outline_in.clear();
    s.reflex.clear();
    // A vertex with more than one outline edge each way (the outline touches itself) is skipped.
    const MANY: u32 = u32::MAX;
    for &(a, b) in &s.edges {
        if !s.edges.contains(&(b, a)) {
            s.outline_out
                .entry(a)
                .and_modify(|to| *to = MANY)
                .or_insert(b);
            s.outline_in
                .entry(b)
                .and_modify(|from| *from = MANY)
                .or_insert(a);
        }
    }
    for (&v, &to) in &s.outline_out {
        let Some(&from) = s.outline_in.get(&v) else {
            continue;
        };
        if to == MANY || from == MANY {
            continue;
        }
        let (p0, p1, p2) = (
            s.screen[from as usize],
            s.screen[v as usize],
            s.screen[to as usize],
        );
        if cross(p0, p1, p2) < 0.0 {
            s.reflex.insert(v, [from, to]);
        }
    }
}

/// The limit record for the hard edge `a — b` (either direction) when it ends at a reflex outline
/// corner and runs on, past that corner, almost along one of the corner's outline edges. There the
/// infinite hard line would cut through that outline edge's anti-aliased pixels (which belong to
/// no piece across it), so beyond the corner the hard test is dropped. Both pieces sharing the edge
/// compute the same record from the same two vertices.
fn hard_limit(s: &MeshScratch, a: u32, b: u32) -> Option<[f32; 4]> {
    for (end, other) in [(a, b), (b, a)] {
        let Some(neighbours) = s.reflex.get(&end) else {
            continue;
        };
        let (pe, po) = (s.screen[end as usize], s.screen[other as usize]);
        let (dx, dy) = (pe.0 - po.0, pe.1 - po.1);
        let length = dx.hypot(dy);
        let ext = (dx / length, dy / length);
        let along = neighbours.iter().any(|&w| {
            let pw = s.screen[w as usize];
            let (wx, wy) = (pw.0 - pe.0, pw.1 - pe.1);
            (ext.0 * wx + ext.1 * wy) / wx.hypot(wy) > LIMIT_ALIGNMENT
        });
        if along {
            return Some([ext.0, ext.1, -(ext.0 * pe.0 + ext.1 * pe.1), 2.0]);
        }
    }
    None
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
/// allowed only between edges of one kind (it is then dropped, joining them into one edge). Where
/// an outline edge meets a hard edge the corner must turn by more than `MIXED_CORNER_SINE`: the
/// outline's coverage is an infinite line, and past a nearly straight corner it would run on just
/// beside the hard edge and thin the pixels along it (#61).
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
    if internal(edges, a, b) != internal(edges, b, c) {
        return turn > MIXED_CORNER_SINE * scale;
    }
    turn >= -COLLINEAR_EPSILON * scale
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
    s: &mut MeshScratch,
    color: &[f32],
    width: f32,
    height: f32,
) -> Result<(), String> {
    // Drop straight corners between outline edges so no line applies its coverage twice. Straight
    // corners between hard edges stay: each hard edge is matched (and its line exactly negated)
    // by the triangle edge across it, which a joined edge would not be.
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
        if cross(pa, pb, pc).abs() <= COLLINEAR_EPSILON * scale
            && !internal(&s.edges, a, b)
            && !internal(&s.edges, b, c)
        {
            piece.remove(index);
        } else {
            index += 1;
        }
    }

    s.corners.clear();
    s.hard.clear();
    s.limits.clear();
    let n = s.piece.len();
    for i in 0..n {
        let (a, b) = (s.piece[i], s.piece[(i + 1) % n]);
        let hard = internal(&s.edges, a, b);
        s.corners.push(s.screen[a as usize]);
        s.hard.push(hard);
        s.limits.push(if hard { hard_limit(s, a, b) } else { None });
    }
    append_coverage_polygon(output, &s.corners, &s.hard, &s.limits, color, width, height)
}
