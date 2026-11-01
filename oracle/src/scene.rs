//! One exported oracle scene (`src/oracle/scenarios.ts` → `scripts/export-oracle-scenes.ts`).

use std::path::Path;

use serde::Deserialize;
use viz_render_kernel::vello_scene::VelloFrame;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub name: String,
    pub capability: String,
    pub workload: String,
    pub time_seconds: f64,
    pub width: u32,
    pub height: u32,
    pub commands: usize,
    pub vello: PackedFrame,
    pub custom: CustomFrame,
}

/// `packVelloFrame`'s arrays: what Vello and Skia render.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackedFrame {
    pub points: Vec<f32>,
    pub spans: Vec<u32>,
    pub verbs: Vec<u32>,
    pub verb_spans: Vec<u32>,
    pub transforms: Vec<f32>,
    pub fill_colors: Vec<f32>,
    pub stroke_colors: Vec<f32>,
    pub stroke_widths: Vec<f32>,
    pub miter_limits: Vec<f32>,
    pub flags: Vec<u32>,
    pub background: Vec<f32>,
}

/// The custom path renders the Vello frame (`packPolygonFrame` is the same arrays without path
/// verbs) unless the TypeScript support check keeps it from rendering the scene.
#[derive(Deserialize)]
pub struct CustomFrame {
    pub error: Option<String>,
}

impl Scene {
    pub fn load(path: &Path) -> Result<Self, String> {
        let text = std::fs::read_to_string(path)
            .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        serde_json::from_str(&text).map_err(|e| format!("cannot parse {}: {e}", path.display()))
    }

    pub fn vello_frame(&self) -> VelloFrame<'_> {
        let v = &self.vello;
        VelloFrame {
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
            background: &v.background,
        }
    }

    /// Why the custom path cannot render this scene, if it cannot.
    pub fn custom_gap(&self) -> Option<&str> {
        self.custom.error.as_deref()
    }
}
