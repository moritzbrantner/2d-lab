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
    pub flags: Vec<u32>,
    pub background: Vec<f32>,
}

/// The custom path's input: the Vello frame's points/spans/transforms plus `packPolygonFrame`'s
/// colors, or the TypeScript support error that keeps the custom path from rendering it.
#[derive(Deserialize)]
pub struct CustomFrame {
    pub error: Option<String>,
    pub colors: Option<Vec<f32>>,
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
            flags: &v.flags,
            background: &v.background,
        }
    }

    /// Why the custom path cannot render this scene, if it cannot.
    pub fn custom_gap(&self) -> Option<&str> {
        match (&self.custom.error, &self.custom.colors) {
            (Some(error), _) => Some(error),
            (None, None) => Some("exported without custom colors"),
            (None, Some(_)) => None,
        }
    }
}
