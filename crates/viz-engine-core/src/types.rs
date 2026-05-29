use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizSeriesPoint {
    pub id: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub metrics: Vec<f64>,
    pub source_index: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizMetricSchema {
    pub keys: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VizValueMode {
    Average,
    Count,
    Min,
    Max,
    Sum,
}

impl Default for VizValueMode {
    fn default() -> Self {
        Self::Average
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizBinnedSeriesQuery {
    pub x_domain: [f64; 2],
    pub target_bin_count: usize,
    #[serde(default)]
    pub include_empty_bins: bool,
    #[serde(default)]
    pub value_mode: VizValueMode,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHistogramQuery {
    pub bucket_count: usize,
    #[serde(default)]
    pub include_empty_buckets: bool,
    #[serde(default)]
    pub value_domain: Option<[f64; 2]>,
    #[serde(default)]
    pub x_domain: Option<[f64; 2]>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHeatmapQuery {
    pub x_bin_count: usize,
    pub x_domain: [f64; 2],
    pub y_bin_count: usize,
    #[serde(default)]
    pub y_domain: Option<[f64; 2]>,
    #[serde(default)]
    pub include_empty_cells: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHitTestQuery {
    pub x: f64,
    pub x_domain: [f64; 2],
    pub target_bin_count: usize,
    #[serde(default)]
    pub value_mode: VizValueMode,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizSeriesBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizDensityBin {
    pub average_y: Option<f64>,
    pub first_point_index: Option<usize>,
    pub index: usize,
    pub last_point_index: Option<usize>,
    pub max_y: Option<f64>,
    pub metrics: BTreeMap<String, f64>,
    pub min_y: Option<f64>,
    pub point_count: usize,
    pub sum_y: f64,
    pub x0: f64,
    pub x1: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizDensitySample {
    pub average_y: Option<f64>,
    pub first_point_index: Option<usize>,
    pub index: usize,
    pub last_point_index: Option<usize>,
    pub max_y: Option<f64>,
    pub metrics: BTreeMap<String, f64>,
    pub min_y: Option<f64>,
    pub point_count: usize,
    pub sum_y: f64,
    pub x: f64,
    pub x0: f64,
    pub x1: f64,
    pub y: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizDensitySeriesSummary {
    pub bin_count: usize,
    pub metrics: BTreeMap<String, f64>,
    pub point_count: usize,
    pub sample_count: usize,
    pub value_mode: VizValueMode,
    pub x_domain: [f64; 2],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizDensitySeries {
    pub bins: Vec<VizDensityBin>,
    pub samples: Vec<VizDensitySample>,
    pub summary: VizDensitySeriesSummary,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHistogramBucket {
    pub average_value: Option<f64>,
    pub first_point_index: Option<usize>,
    pub index: usize,
    pub last_point_index: Option<usize>,
    pub max_value: Option<f64>,
    pub metrics: BTreeMap<String, f64>,
    pub min_value: Option<f64>,
    pub point_count: usize,
    pub sum_value: f64,
    pub value: f64,
    pub value0: f64,
    pub value1: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHistogramSummary {
    pub bucket_count: usize,
    pub metrics: BTreeMap<String, f64>,
    pub point_count: usize,
    pub value_domain: [f64; 2],
    pub x_domain: Option<[f64; 2]>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHistogram {
    pub buckets: Vec<VizHistogramBucket>,
    pub summary: VizHistogramSummary,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHeatmapCell {
    pub average_value: Option<f64>,
    pub first_point_index: Option<usize>,
    pub index: usize,
    pub last_point_index: Option<usize>,
    pub metrics: BTreeMap<String, f64>,
    pub point_count: usize,
    pub sum_value: f64,
    pub value: f64,
    pub x: f64,
    pub x0: f64,
    pub x1: f64,
    pub x_index: usize,
    pub y: f64,
    pub y0: f64,
    pub y1: f64,
    pub y_index: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHeatmapSummary {
    pub max_cell_count: usize,
    pub metrics: BTreeMap<String, f64>,
    pub point_count: usize,
    pub x_bin_count: usize,
    pub x_domain: [f64; 2],
    pub y_bin_count: usize,
    pub y_domain: [f64; 2],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHeatmap {
    pub cells: Vec<VizHeatmapCell>,
    pub summary: VizHeatmapSummary,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizHitTestResult {
    pub point_count: usize,
    pub sample_index: usize,
    pub source_point_id: Option<String>,
    pub source_point_index: Option<usize>,
    pub x: f64,
    pub y: Option<f64>,
}
