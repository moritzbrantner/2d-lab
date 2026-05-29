use serde::Deserialize;
use wasm_bindgen::prelude::*;

use viz_engine_core::{
    VizBinnedSeriesQuery, VizDensityIndex, VizHeatmapQuery, VizHistogramQuery, VizHitTestQuery,
    VizMetricSchema, VizSeriesPoint,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VizEngineWasmDensityIndexInit {
    metric_keys: Vec<String>,
    x: Vec<f64>,
    y: Vec<f64>,
    #[serde(default)]
    ids: Vec<String>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    metrics: Vec<Vec<f64>>,
    #[serde(default)]
    source_indices: Vec<usize>,
}

#[wasm_bindgen]
pub struct VizEngineWasmDensityIndex {
    index: VizDensityIndex,
}

#[wasm_bindgen]
impl VizEngineWasmDensityIndex {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<VizEngineWasmDensityIndex, JsValue> {
        let input: VizEngineWasmDensityIndexInit = serde_wasm_bindgen::from_value(input)?;
        let point_count = input.x.len().min(input.y.len());
        let points = (0..point_count)
            .map(|source_index| VizSeriesPoint {
                id: input.ids.get(source_index).cloned().unwrap_or_default(),
                label: input.labels.get(source_index).cloned().unwrap_or_default(),
                x: input.x[source_index],
                y: input.y[source_index],
                metrics: input.metrics.get(source_index).cloned().unwrap_or_default(),
                source_index: input
                    .source_indices
                    .get(source_index)
                    .copied()
                    .unwrap_or(source_index),
            })
            .collect();

        Ok(Self {
            index: VizDensityIndex::new(
                points,
                VizMetricSchema {
                    keys: input.metric_keys,
                },
            ),
        })
    }

    #[wasm_bindgen(js_name = getBinnedSeries)]
    pub fn get_binned_series(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizBinnedSeriesQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_binned_series(query))
            .map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getHistogram)]
    pub fn get_histogram(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizHistogramQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_histogram(query)).map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getHeatmap)]
    pub fn get_heatmap(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizHeatmapQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_heatmap(query)).map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getSeriesBounds)]
    pub fn get_series_bounds(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.index.get_series_bounds()).map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = hitTestX)]
    pub fn hit_test_x(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizHitTestQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.hit_test_x(query)).map_err(|error| error.into())
    }
}
