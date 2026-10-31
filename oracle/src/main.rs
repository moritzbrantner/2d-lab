//! 2d-lab oracle gate. Renders every exported scenario (`bun run oracle:scenes`) three ways — the
//! custom Rust/WebGPU immediate path, Vello GPU and Skia (tiny-skia) — from the same packed display
//! list, and gates the custom path per scenario:
//!
//! - image: NVIDIA FLIP against **each** oracle, mean ≤ `FLIP_MEAN_MAX` and p99 ≤ `FLIP_P99_MAX`;
//! - GPU time: the custom path's median GPU frame time ≤ `GPU_MARGIN` × Vello's. Enforced on a
//!   hardware adapter with timestamp queries; advisory on software adapters (lavapipe on CI).
//!   Skia (tiny-skia) is a CPU rasterizer, so its CPU time is reported but not gated.
//!
//! The Vello–Skia FLIP is the noise floor: how much the two established rasterizers disagree.
//!
//! Scenarios the custom path cannot pass yet are listed in `KNOWN_GAPS` with their issue. A listed
//! check that starts passing fails the gate until its entry is removed, so the list only shrinks.
//!
//! ```text
//! oracle [--scenes DIR] [--out DIR] [--frames N] [--no-timing] [--only NAME]...
//! ```
//! writes `<scenario>.{custom,vello,skia}.png`, `<scenario>.<test>-vs-<ref>.flip.png`,
//! `report.json` and `index.html` (the side-by-side report) to `--out` (default `target/oracle`).

mod gpu;
mod scene;
mod skia;

use std::{path::PathBuf, process::ExitCode};

use scene::Scene;

/// Mean FLIP error (0 = identical, 1 = maximally different) above which a scenario fails.
const FLIP_MEAN_MAX: f32 = 0.005;
/// 99th-percentile per-pixel FLIP error above which a scenario fails.
const FLIP_P99_MAX: f32 = 0.05;
/// The custom path's median GPU frame time may be at most this multiple of Vello's.
const GPU_MARGIN: f64 = 1.10;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Check {
    /// The custom path cannot render the scenario at all.
    Unsupported,
    /// FLIP against Skia or Vello over the threshold.
    Image,
    /// Slower than `GPU_MARGIN` × Vello on the GPU.
    GpuTime,
}

/// Per-scenario FLIP limits (mean, p99) where Vello and Skia themselves disagree by more than the
/// defaults. A renderer matching one oracle exactly scores the Vello–Skia noise floor against the
/// other, so the limit is that measured floor rounded up (mean to 0.001, p99 to 0.01). Measured
/// 2026-10-31, identical to 3 decimals on an RTX 3060 Ti and lavapipe; the difference is edge
/// anti-aliasing (coverage rounding on thin strokes and curve edges) and ±1/255 rounding of
/// translucent fills. Scenarios not listed use `FLIP_MEAN_MAX` / `FLIP_P99_MAX`.
const AA_LIMITS: &[(&str, f32, f32)] = &[
    ("curves", 0.007, 0.13),                   // floor 0.0061 / 0.122
    ("fills", 0.006, 0.06),                    // floor 0.0057 / 0.053
    ("maps-snapshot", 0.013, 0.13),            // floor 0.0129 / 0.120
    ("scaling", 0.006, FLIP_P99_MAX),          // floor 0.0055 / 0.028
    ("strokes", 0.012, 0.07),                  // floor 0.0115 / 0.064
    ("vector-animation", FLIP_MEAN_MAX, 0.06), // floor 0.0048 / 0.058
];

fn limits(scenario: &str) -> (f32, f32) {
    AA_LIMITS
        .iter()
        .find(|(name, _, _)| *name == scenario)
        .map_or((FLIP_MEAN_MAX, FLIP_P99_MAX), |&(_, mean, p99)| (mean, p99))
}

/// Known custom-path gaps, each tracked by an issue. Never raise a limit to clear one; fix the
/// renderer and delete the entry (the gate fails while a listed check passes).
const KNOWN_GAPS: &[(&str, Check, &str)] = &[
    ("fills", Check::Image, "#55"),
    ("transforms", Check::Image, "#55"),
    ("scaling", Check::Image, "#55"),
    ("strokes", Check::Unsupported, "#56"),
    ("vector-animation", Check::Unsupported, "#56"),
    ("maps-snapshot", Check::Unsupported, "#56"),
    ("curves", Check::Unsupported, "#57"),
];

struct Options {
    scenes: PathBuf,
    out: PathBuf,
    frames: usize,
    timing: bool,
    only: Vec<String>,
}

fn options() -> Result<Options, String> {
    let mut o = Options {
        scenes: PathBuf::from("target/oracle-scenes"),
        out: PathBuf::from("target/oracle"),
        frames: 60,
        timing: true,
        only: Vec::new(),
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = || args.next().ok_or_else(|| format!("{arg} needs a value"));
        match arg.as_str() {
            "--scenes" => o.scenes = value()?.into(),
            "--out" => o.out = value()?.into(),
            "--frames" => o.frames = value()?.parse().map_err(|e| format!("--frames: {e}"))?,
            "--no-timing" => o.timing = false,
            "--only" => o.only.push(value()?),
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(o)
}

struct Flip {
    mean: f32,
    /// 99th-percentile per-pixel error: catches local defects (a missing stroke) that the
    /// whole-image mean dilutes.
    p99: f32,
    heatmap: Vec<u8>,
}

impl Flip {
    fn ok(&self, (mean_max, p99_max): (f32, f32)) -> bool {
        self.mean <= mean_max && self.p99 <= p99_max
    }

    fn json(&self, limits: (f32, f32)) -> serde_json::Value {
        serde_json::json!({ "mean": self.mean, "p99": self.p99, "pass": self.ok(limits) })
    }
}

fn flip(w: u32, h: u32, reference: &[u8], test: &[u8]) -> Flip {
    let rgb = |rgba: &[u8]| -> Vec<u8> {
        rgba.as_chunks::<4>()
            .0
            .iter()
            .flat_map(|p| [p[0], p[1], p[2]])
            .collect()
    };
    let reference = nv_flip::FlipImageRgb8::with_data(w, h, &rgb(reference));
    let test = nv_flip::FlipImageRgb8::with_data(w, h, &rgb(test));
    let error = nv_flip::flip(reference, test, nv_flip::DEFAULT_PIXELS_PER_DEGREE);
    let mut pool = nv_flip::FlipPool::from_image(&error);
    let heatmap = error
        .apply_color_lut(&nv_flip::magma_lut())
        .to_vec()
        .as_chunks::<3>()
        .0
        .iter()
        .flat_map(|p| [p[0], p[1], p[2], 255])
        .collect();
    Flip {
        mean: pool.mean(),
        p99: pool.get_percentile(0.99, false),
        heatmap,
    }
}

fn median(mut values: Vec<f64>) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    Some(values[values.len() / 2])
}

fn save_png(path: &std::path::Path, w: u32, h: u32, rgba: &[u8]) -> Result<(), String> {
    image::RgbaImage::from_raw(w, h, rgba.to_vec())
        .ok_or("pixel buffer does not match the image size")?
        .save(path)
        .map_err(|e| format!("cannot write {}: {e}", path.display()))
}

fn load_scenes(o: &Options) -> Result<Vec<Scene>, String> {
    let mut paths: Vec<_> = std::fs::read_dir(&o.scenes)
        .map_err(|e| {
            format!(
                "cannot read {} ({e}); run `bun run oracle:scenes` first",
                o.scenes.display()
            )
        })?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    paths.sort();
    let mut scenes = paths
        .iter()
        .map(|p| Scene::load(p))
        .collect::<Result<Vec<_>, _>>()?;
    if let Some(unknown) = o
        .only
        .iter()
        .find(|n| !scenes.iter().any(|s| &s.name == *n))
    {
        return Err(format!("unknown scenario {unknown}"));
    }
    scenes.retain(|s| o.only.is_empty() || o.only.contains(&s.name));
    if scenes.is_empty() {
        return Err("no scenarios".into());
    }
    let named = KNOWN_GAPS
        .iter()
        .map(|g| g.0)
        .chain(AA_LIMITS.iter().map(|l| l.0));
    for name in named {
        if !paths
            .iter()
            .any(|p| p.file_stem().is_some_and(|s| *s == *name))
        {
            return Err(format!(
                "KNOWN_GAPS or AA_LIMITS name unknown scenario {name}"
            ));
        }
    }
    Ok(scenes)
}

fn main() -> ExitCode {
    let o = match options() {
        Ok(o) => o,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    match run(&o) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn run(o: &Options) -> Result<bool, String> {
    let scenes = load_scenes(o)?;
    std::fs::create_dir_all(&o.out)
        .map_err(|e| format!("cannot create {}: {e}", o.out.display()))?;
    let gpu = gpu::Gpu::new()?;
    let gate_timing = o.timing && gpu.timestamps() && !gpu.software();
    let frames = if o.timing { o.frames } else { 1 };
    println!(
        "adapter: {} ({:?}, {:?}); GPU-time gate: {}",
        gpu.adapter.name,
        gpu.adapter.device_type,
        gpu.adapter.backend,
        if gate_timing {
            format!("enforced (≤ {GPU_MARGIN:.2}× Vello)")
        } else {
            "advisory".into()
        }
    );
    println!(
        "{:<17} {:>15} {:>15} {:>15} {:>9} {:>9} {:>6}  result",
        "scenario",
        "vs Skia mean/p99",
        "vs Vello",
        "Vello-Skia floor",
        "custom ms",
        "Vello ms",
        "ratio"
    );

    let mut all_ok = true;
    let mut report = Vec::new();
    for s in &scenes {
        let (w, h) = (s.width, s.height);
        let lim = limits(&s.name);
        let write = |suffix: &str, rgba: &[u8]| {
            if let Err(e) = save_png(&o.out.join(format!("{}.{suffix}.png", s.name)), w, h, rgba) {
                eprintln!("{e}");
            }
        };
        let (skia_rgba, skia_ms) = skia::render(s, frames)?;
        let vello = gpu.render_vello(s, frames)?;
        write("skia", &skia_rgba);
        write("vello", &vello.rgba);
        let floor = flip(w, h, &skia_rgba, &vello.rgba);
        write("vello-vs-skia.flip", &floor.heatmap);

        let custom = match s.custom_gap() {
            Some(gap) => Err(gap.to_string()),
            None => gpu.render_custom(s, frames),
        };
        let mut failed: Vec<(Check, String)> = Vec::new();
        let mut row = serde_json::json!({
            "name": s.name,
            "capability": s.capability,
            "workload": s.workload,
            "time_seconds": s.time_seconds,
            "width": w,
            "height": h,
            "commands": s.commands,
            "flip_limits": [lim.0, lim.1],
            "noise_floor": floor.json(lim),
            "skia_cpu_ms": median(skia_ms),
            "vello_gpu_ms": median(vello.gpu_ms.clone()),
            "vello_cpu_ms": median(vello.cpu_ms.clone()),
        });
        let (mut vs_skia_text, mut vs_vello_text, mut custom_ms, mut ratio) =
            ("-".to_string(), "-".to_string(), None, None);
        match custom {
            Err(reason) => {
                failed.push((
                    Check::Unsupported,
                    format!("custom path unsupported: {reason}"),
                ));
                row["custom_error"] = reason.into();
            }
            Ok(custom) => {
                write("custom", &custom.rgba);
                let vs_skia = flip(w, h, &skia_rgba, &custom.rgba);
                let vs_vello = flip(w, h, &vello.rgba, &custom.rgba);
                write("custom-vs-skia.flip", &vs_skia.heatmap);
                write("custom-vs-vello.flip", &vs_vello.heatmap);
                vs_skia_text = format!("{:.4}/{:.3}", vs_skia.mean, vs_skia.p99);
                vs_vello_text = format!("{:.4}/{:.3}", vs_vello.mean, vs_vello.p99);
                for (oracle, f) in [("Skia", &vs_skia), ("Vello", &vs_vello)] {
                    if !f.ok(lim) {
                        failed.push((
                            Check::Image,
                            format!(
                                "differs from {oracle} (FLIP mean {:.4} / p99 {:.3} > {} / {})",
                                f.mean, f.p99, lim.0, lim.1
                            ),
                        ));
                    }
                }
                custom_ms = median(custom.gpu_ms.clone());
                ratio = custom_ms
                    .zip(median(vello.gpu_ms.clone()))
                    .map(|(c, v)| c / v);
                if gate_timing {
                    match ratio {
                        None => failed.push((Check::GpuTime, "no GPU timestamps".into())),
                        Some(r) if r > GPU_MARGIN => failed.push((
                            Check::GpuTime,
                            format!("GPU time {r:.2}× Vello > {GPU_MARGIN:.2}×"),
                        )),
                        _ => {}
                    }
                }
                row["vs_skia"] = vs_skia.json(lim);
                row["vs_vello"] = vs_vello.json(lim);
                row["custom_gpu_ms"] = custom_ms.into();
                row["custom_cpu_ms"] = median(custom.cpu_ms).into();
                row["gpu_ratio"] = ratio.into();
            }
        }

        // Known gaps: tolerated while failing, an error once their check passes (when enforced).
        let gaps: Vec<_> = KNOWN_GAPS.iter().filter(|(n, _, _)| *n == s.name).collect();
        let mut problems = Vec::new();
        // The limits are only meaningful while the two oracles agree within them (this caught the
        // Vello adapter double-encoding sRGB).
        if !floor.ok(lim) {
            problems.push(format!(
                "Vello and Skia disagree beyond the scenario limit (FLIP mean {:.4} / p99 {:.3} > {} / {})",
                floor.mean, floor.p99, lim.0, lim.1
            ));
        }
        let mut tolerated = Vec::new();
        for (check, message) in &failed {
            match gaps.iter().find(|(_, c, _)| c == check) {
                Some((_, _, issue)) => tolerated.push(format!("{message} [known gap {issue}]")),
                None => problems.push(message.clone()),
            }
        }
        for (_, check, issue) in &gaps {
            let enforced = *check != Check::GpuTime || gate_timing;
            // An unsupported scenario never reaches the image/timing checks; don't call those closed.
            let reached = *check == Check::Unsupported
                || !failed.iter().any(|(c, _)| *c == Check::Unsupported);
            if enforced && reached && !failed.iter().any(|(c, _)| c == check) {
                problems.push(format!(
                    "{check:?} gap {issue} now passes: remove it from KNOWN_GAPS"
                ));
            }
        }
        let status = if !problems.is_empty() {
            "fail"
        } else if !tolerated.is_empty() {
            "known-gap"
        } else {
            "pass"
        };
        all_ok &= problems.is_empty();
        let fmt = |v: Option<f64>| v.map_or("-".to_string(), |v| format!("{v:.3}"));
        let result = match status {
            "pass" if !gate_timing && ratio.is_some_and(|r| r > GPU_MARGIN) => {
                "ok (slower than Vello, advisory)".to_string()
            }
            "pass" => "ok".into(),
            "known-gap" => format!("KNOWN GAP: {}", tolerated.join("; ")),
            _ => format!(
                "FAIL: {}",
                problems
                    .iter()
                    .chain(&tolerated)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("; ")
            ),
        };
        println!(
            "{:<17} {:>15} {:>15} {:>15} {:>9} {:>9} {:>6}  {result}",
            s.name,
            vs_skia_text,
            vs_vello_text,
            format!("{:.4}/{:.3}", floor.mean, floor.p99),
            fmt(custom_ms),
            fmt(row["vello_gpu_ms"].as_f64()),
            ratio.map_or("-".into(), |r| format!("{r:.2}")),
        );
        row["status"] = status.into();
        row["problems"] = problems.into();
        row["known_gaps"] = tolerated.into();
        report.push(row);
    }

    let report = serde_json::json!({
        "adapter": {
            "name": gpu.adapter.name,
            "device_type": format!("{:?}", gpu.adapter.device_type),
            "backend": format!("{:?}", gpu.adapter.backend),
        },
        "flip_mean_max": FLIP_MEAN_MAX,
        "flip_p99_max": FLIP_P99_MAX,
        "gpu_margin": GPU_MARGIN,
        "gpu_gate": if gate_timing { "enforced" } else { "advisory" },
        "frames": frames,
        "pass": all_ok,
        "scenarios": report,
    });
    std::fs::write(
        o.out.join("report.json"),
        serde_json::to_string_pretty(&report).expect("json"),
    )
    .map_err(|e| format!("cannot write report.json: {e}"))?;
    std::fs::write(
        o.out.join("index.html"),
        include_str!("../report/index.html"),
    )
    .map_err(|e| format!("cannot write index.html: {e}"))?;
    let scenarios = report["scenarios"].as_array().expect("array");
    let count = |status: &str| scenarios.iter().filter(|r| r["status"] == status).count();
    println!(
        "{}: {} pass, {} known gap, {} fail; report in {}",
        if all_ok {
            "oracle gate passed"
        } else {
            "ORACLE GATE FAILED"
        },
        count("pass"),
        count("known-gap"),
        count("fail"),
        o.out.join("index.html").display()
    );
    Ok(all_ok)
}

#[cfg(test)]
mod tests {
    use super::flip;

    #[test]
    fn flip_separates_identical_from_different_images() {
        let (w, h) = (64, 64);
        let grey = vec![128u8; w * h * 4];
        let mut half = grey.clone();
        for px in half.as_chunks_mut::<4>().0.iter_mut().take(w * h / 2) {
            px[..3].copy_from_slice(&[255, 0, 0]);
        }
        assert_eq!(flip(w as u32, h as u32, &grey, &grey).mean, 0.0);
        assert!(flip(w as u32, h as u32, &grey, &half).mean > super::FLIP_MEAN_MAX);
    }
}
