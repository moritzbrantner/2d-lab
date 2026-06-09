use serde::Deserialize;
use wasm_bindgen::prelude::*;

mod finance;
mod geo;
mod table;

use js_sys::{Array, Float64Array, Int32Array, Object, Reflect, Uint32Array};
use viz_engine_core::{
    VizBinnedSeriesQuery, VizDensityIndex, VizHeatmapQuery, VizHistogramQuery, VizHitTestQuery,
    VizMetricSchema, VizRollingSeriesQuery, VizRollingStatistic, VizSeriesPoint, VizValueMode,
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
        Ok(Self::from_parts(
            input.metric_keys,
            input.x,
            input.y,
            input.ids,
            input.labels,
            input.metrics,
            input.source_indices,
        ))
    }

    #[wasm_bindgen(js_name = fromArrays)]
    pub fn from_arrays(
        x: Float64Array,
        y: Float64Array,
        source_indices: Uint32Array,
        metric_keys: JsValue,
        metrics: Float64Array,
        metric_count: usize,
        ids: JsValue,
        labels: JsValue,
    ) -> Result<VizEngineWasmDensityIndex, JsValue> {
        let metric_keys: Vec<String> = serde_wasm_bindgen::from_value(metric_keys)?;
        let ids: Vec<String> = serde_wasm_bindgen::from_value(ids)?;
        let labels: Vec<String> = serde_wasm_bindgen::from_value(labels)?;
        let x = x.to_vec();
        let y = y.to_vec();
        let point_count = x.len().min(y.len());
        let source_indices = source_indices
            .to_vec()
            .into_iter()
            .map(|index| index as usize)
            .collect();
        let metrics = inflate_metric_rows(metrics.to_vec(), point_count, metric_count);

        Ok(Self::from_parts(
            metric_keys,
            x,
            y,
            ids,
            labels,
            metrics,
            source_indices,
        ))
    }

    #[wasm_bindgen(js_name = getBinnedSeries)]
    pub fn get_binned_series(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizBinnedSeriesQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_binned_series(query))
            .map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getCompactChartSeries)]
    pub fn get_compact_chart_series(
        &self,
        x_min: f64,
        x_max: f64,
        target_bin_count: usize,
        include_empty_bins: bool,
        value_mode: String,
    ) -> Result<JsValue, JsValue> {
        let x_domain = normalize_domain([x_min, x_max]);
        let bin_count = clamp_count(target_bin_count);
        let width = bin_width(x_domain, bin_count);
        let value_mode = parse_value_mode(&value_mode);
        let metric_keys = &self.index.metric_schema().keys;
        let mut counts = vec![0_u32; bin_count];
        let mut sums = vec![0.0; bin_count];
        let mut min_y = vec![f64::NAN; bin_count];
        let mut max_y = vec![f64::NAN; bin_count];
        let mut first_indexes = vec![-1_i32; bin_count];
        let mut last_indexes = vec![-1_i32; bin_count];
        let mut metric_sums = vec![vec![0.0; bin_count]; metric_keys.len()];

        for point in points_in_x_domain(self.index.points(), x_domain) {
            let index = bucket_index(point.x, x_domain, bin_count);
            counts[index] += 1;
            sums[index] += point.y;
            min_y[index] = if min_y[index].is_nan() {
                point.y
            } else {
                min_y[index].min(point.y)
            };
            max_y[index] = if max_y[index].is_nan() {
                point.y
            } else {
                max_y[index].max(point.y)
            };
            if first_indexes[index] < 0 {
                first_indexes[index] = point.source_index as i32;
            }
            last_indexes[index] = point.source_index as i32;
            for (metric_index, value) in point.metrics.iter().enumerate().take(metric_keys.len()) {
                metric_sums[metric_index][index] += *value;
            }
        }

        let visible = visible_indexes(&counts, include_empty_bins);
        let mut x0 = Vec::with_capacity(visible.len());
        let mut x1 = Vec::with_capacity(visible.len());
        let mut y = Vec::with_capacity(visible.len());
        let mut average_y = Vec::with_capacity(visible.len());
        let mut output_counts = Vec::with_capacity(visible.len());
        let mut output_sums = Vec::with_capacity(visible.len());
        let mut output_min_y = Vec::with_capacity(visible.len());
        let mut output_max_y = Vec::with_capacity(visible.len());
        let mut output_first_indexes = Vec::with_capacity(visible.len());
        let mut output_last_indexes = Vec::with_capacity(visible.len());
        let mut output_metric_sums = vec![Vec::with_capacity(visible.len()); metric_keys.len()];

        for source_index in visible {
            let bucket_x0 = x_domain[0] + source_index as f64 * width;
            let bucket_x1 = if source_index + 1 == bin_count {
                x_domain[1]
            } else {
                x_domain[0] + (source_index + 1) as f64 * width
            };
            let count = counts[source_index];
            let average = if count > 0 {
                sums[source_index] / count as f64
            } else {
                f64::NAN
            };

            x0.push(bucket_x0);
            x1.push(bucket_x1);
            average_y.push(average);
            output_counts.push(count);
            output_sums.push(sums[source_index]);
            output_min_y.push(min_y[source_index]);
            output_max_y.push(max_y[source_index]);
            output_first_indexes.push(first_indexes[source_index]);
            output_last_indexes.push(last_indexes[source_index]);
            y.push(compact_density_y(
                value_mode,
                average,
                count,
                sums[source_index],
                min_y[source_index],
                max_y[source_index],
            ));
            for metric_index in 0..metric_keys.len() {
                output_metric_sums[metric_index].push(metric_sums[metric_index][source_index]);
            }
        }

        let point_count = output_counts.iter().map(|value| *value as usize).sum();
        Ok(compact_density_object(CompactDensityObject {
            average_y,
            first_indexes: output_first_indexes,
            last_indexes: output_last_indexes,
            max_y: output_max_y,
            metric_keys,
            metric_sums: output_metric_sums,
            min_y: output_min_y,
            point_count,
            counts: output_counts,
            sample_count: x0.len(),
            sum_y: output_sums,
            value_mode,
            x0,
            x1,
            x_domain,
            y,
        }))
    }

    #[wasm_bindgen(js_name = getHistogram)]
    pub fn get_histogram(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizHistogramQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_histogram(query)).map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getCompactHistogram)]
    pub fn get_compact_histogram(
        &self,
        bucket_count: usize,
        include_empty_buckets: bool,
        x_min: f64,
        x_max: f64,
        value_min: f64,
        value_max: f64,
    ) -> Result<JsValue, JsValue> {
        let bucket_count = clamp_count(bucket_count);
        let x_domain =
            (x_min.is_finite() && x_max.is_finite()).then(|| normalize_domain([x_min, x_max]));
        let points = match x_domain {
            Some(domain) => points_in_x_domain(self.index.points(), domain),
            None => self.index.points(),
        };
        let value_domain = if value_min.is_finite() && value_max.is_finite() {
            normalize_domain([value_min, value_max])
        } else {
            derive_domain(points.iter().map(|point| point.y))
        };
        let width = bin_width(value_domain, bucket_count);
        let metric_keys = &self.index.metric_schema().keys;
        let mut counts = vec![0_u32; bucket_count];
        let mut sums = vec![0.0; bucket_count];
        let mut min_value = vec![f64::NAN; bucket_count];
        let mut max_value = vec![f64::NAN; bucket_count];
        let mut first_indexes = vec![-1_i32; bucket_count];
        let mut last_indexes = vec![-1_i32; bucket_count];
        let mut metric_sums = vec![vec![0.0; bucket_count]; metric_keys.len()];

        for point in points {
            if point.y < value_domain[0] || point.y > value_domain[1] {
                continue;
            }
            let index = bucket_index(point.y, value_domain, bucket_count);
            counts[index] += 1;
            sums[index] += point.y;
            min_value[index] = if min_value[index].is_nan() {
                point.y
            } else {
                min_value[index].min(point.y)
            };
            max_value[index] = if max_value[index].is_nan() {
                point.y
            } else {
                max_value[index].max(point.y)
            };
            if first_indexes[index] < 0 {
                first_indexes[index] = point.source_index as i32;
            }
            last_indexes[index] = point.source_index as i32;
            for (metric_index, value) in point.metrics.iter().enumerate().take(metric_keys.len()) {
                metric_sums[metric_index][index] += *value;
            }
        }

        let visible = visible_indexes(&counts, include_empty_buckets);
        let object = Object::new();
        set(
            &object,
            "averageValue",
            f64_array_from_iter(visible.iter().map(|index| {
                if counts[*index] > 0 {
                    sums[*index] / counts[*index] as f64
                } else {
                    f64::NAN
                }
            })),
        )?;
        set(
            &object,
            "firstPointIndex",
            i32_array_from_iter(visible.iter().map(|index| first_indexes[*index])),
        )?;
        set(
            &object,
            "lastPointIndex",
            i32_array_from_iter(visible.iter().map(|index| last_indexes[*index])),
        )?;
        set(
            &object,
            "maxValue",
            f64_array_from_iter(visible.iter().map(|index| max_value[*index])),
        )?;
        set(
            &object,
            "minValue",
            f64_array_from_iter(visible.iter().map(|index| min_value[*index])),
        )?;
        set(
            &object,
            "pointCount",
            u32_array_from_iter(visible.iter().map(|index| counts[*index])),
        )?;
        set(
            &object,
            "sumValue",
            f64_array_from_iter(visible.iter().map(|index| sums[*index])),
        )?;
        set(
            &object,
            "value",
            f64_array_from_iter(
                visible
                    .iter()
                    .map(|index| value_domain[0] + *index as f64 * width + width / 2.0),
            ),
        )?;
        set(
            &object,
            "value0",
            f64_array_from_iter(
                visible
                    .iter()
                    .map(|index| value_domain[0] + *index as f64 * width),
            ),
        )?;
        set(
            &object,
            "value1",
            f64_array_from_iter(visible.iter().map(|index| {
                if *index + 1 == bucket_count {
                    value_domain[1]
                } else {
                    value_domain[0] + (*index + 1) as f64 * width
                }
            })),
        )?;
        set(
            &object,
            "metrics",
            metric_object(metric_keys, &metric_sums, &visible)?,
        )?;
        set(
            &object,
            "summary",
            summary_object(&[
                ("bucketCount", JsValue::from_f64(visible.len() as f64)),
                (
                    "pointCount",
                    JsValue::from_f64(
                        counts.iter().map(|value| *value as usize).sum::<usize>() as f64
                    ),
                ),
                ("valueDomain", domain_array(value_domain)),
                ("xDomain", x_domain.map_or(JsValue::NULL, domain_array)),
                ("metricKeys", string_array(metric_keys).into()),
            ])?,
        )?;
        Ok(object.into())
    }

    #[wasm_bindgen(js_name = getHeatmap)]
    pub fn get_heatmap(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizHeatmapQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_heatmap(query)).map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getCompactHeatmap)]
    pub fn get_compact_heatmap(
        &self,
        x_min: f64,
        x_max: f64,
        x_bin_count: usize,
        y_bin_count: usize,
        include_empty_cells: bool,
        y_min: f64,
        y_max: f64,
    ) -> Result<JsValue, JsValue> {
        let x_bin_count = clamp_count(x_bin_count);
        let y_bin_count = clamp_count(y_bin_count);
        let x_domain = normalize_domain([x_min, x_max]);
        let points = points_in_x_domain(self.index.points(), x_domain);
        let y_domain = if y_min.is_finite() && y_max.is_finite() {
            normalize_domain([y_min, y_max])
        } else {
            derive_domain(points.iter().map(|point| point.y))
        };
        let cell_count = x_bin_count * y_bin_count;
        let metric_keys = &self.index.metric_schema().keys;
        let mut counts = vec![0_u32; cell_count];
        let mut sums = vec![0.0; cell_count];
        let mut first_indexes = vec![-1_i32; cell_count];
        let mut last_indexes = vec![-1_i32; cell_count];
        let mut metric_sums = vec![vec![0.0; cell_count]; metric_keys.len()];
        let mut max_cell_count = 0_u32;
        let mut summary_point_count = 0_u32;

        for point in points {
            if point.y < y_domain[0] || point.y > y_domain[1] {
                continue;
            }
            let x_index = bucket_index(point.x, x_domain, x_bin_count);
            let y_index = bucket_index(point.y, y_domain, y_bin_count);
            let index = y_index * x_bin_count + x_index;
            counts[index] += 1;
            sums[index] += point.y;
            if first_indexes[index] < 0 {
                first_indexes[index] = point.source_index as i32;
            }
            last_indexes[index] = point.source_index as i32;
            max_cell_count = max_cell_count.max(counts[index]);
            summary_point_count += 1;
            for (metric_index, value) in point.metrics.iter().enumerate().take(metric_keys.len()) {
                metric_sums[metric_index][index] += *value;
            }
        }

        let output_len = if include_empty_cells {
            cell_count
        } else {
            counts.iter().filter(|count| **count > 0).count()
        };
        let mut average_value = vec![f64::NAN; output_len];
        let mut first_point_index = vec![-1_i32; output_len];
        let mut last_point_index = vec![-1_i32; output_len];
        let mut point_count = vec![0_u32; output_len];
        let mut sum_value = vec![0.0; output_len];
        let mut value = vec![0.0; output_len];
        let mut x_index = vec![0_u32; output_len];
        let mut y_index = vec![0_u32; output_len];
        let mut output_metrics = vec![vec![0.0; output_len]; metric_keys.len()];
        let mut output_index = 0;

        for source_index in 0..cell_count {
            let count = counts[source_index];
            if !include_empty_cells && count == 0 {
                continue;
            }

            if count > 0 {
                average_value[output_index] = sums[source_index] / count as f64;
            }
            first_point_index[output_index] = first_indexes[source_index];
            last_point_index[output_index] = last_indexes[source_index];
            point_count[output_index] = count;
            sum_value[output_index] = sums[source_index];
            value[output_index] = if max_cell_count > 0 {
                count as f64 / max_cell_count as f64
            } else {
                0.0
            };
            x_index[output_index] = (source_index % x_bin_count) as u32;
            y_index[output_index] = (source_index / x_bin_count) as u32;
            for metric_index in 0..metric_keys.len() {
                output_metrics[metric_index][output_index] =
                    metric_sums[metric_index][source_index];
            }
            output_index += 1;
        }

        let object = Object::new();
        set(
            &object,
            "averageValue",
            Float64Array::from(average_value.as_slice()),
        )?;
        set(
            &object,
            "firstPointIndex",
            Int32Array::from(first_point_index.as_slice()),
        )?;
        set(
            &object,
            "lastPointIndex",
            Int32Array::from(last_point_index.as_slice()),
        )?;
        set(
            &object,
            "pointCount",
            Uint32Array::from(point_count.as_slice()),
        )?;
        set(
            &object,
            "sumValue",
            Float64Array::from(sum_value.as_slice()),
        )?;
        set(&object, "value", Float64Array::from(value.as_slice()))?;
        set(&object, "xIndex", Uint32Array::from(x_index.as_slice()))?;
        set(&object, "yIndex", Uint32Array::from(y_index.as_slice()))?;
        set(
            &object,
            "metrics",
            metric_output_object(metric_keys, &output_metrics)?,
        )?;
        set(
            &object,
            "summary",
            summary_object(&[
                ("maxCellCount", JsValue::from_f64(max_cell_count as f64)),
                ("pointCount", JsValue::from_f64(summary_point_count as f64)),
                ("xBinCount", JsValue::from_f64(x_bin_count as f64)),
                ("xDomain", domain_array(x_domain)),
                ("yBinCount", JsValue::from_f64(y_bin_count as f64)),
                ("yDomain", domain_array(y_domain)),
                ("metricKeys", string_array(metric_keys).into()),
            ])?,
        )?;
        Ok(object.into())
    }

    #[wasm_bindgen(js_name = getRollingSeries)]
    pub fn get_rolling_series(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizRollingSeriesQuery = serde_wasm_bindgen::from_value(query)?;
        serde_wasm_bindgen::to_value(&self.index.get_rolling_series(query))
            .map_err(|error| error.into())
    }

    #[wasm_bindgen(js_name = getCompactRollingSeries)]
    pub fn get_compact_rolling_series(
        &self,
        x_min: f64,
        x_max: f64,
        window_size: usize,
        min_periods: usize,
        alpha: f64,
        statistic: String,
    ) -> Result<JsValue, JsValue> {
        let series = self.index.get_rolling_series(VizRollingSeriesQuery {
            alpha: alpha.is_finite().then_some(alpha),
            min_periods: (min_periods > 0).then_some(min_periods),
            statistic: parse_rolling_statistic(&statistic),
            window_size,
            x_domain: normalize_domain([x_min, x_max]),
        });
        let object = Object::new();
        set(
            &object,
            "ema",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.ema.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "max",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.max.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "mean",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.mean.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "min",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.min.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "pointCount",
            u32_array_from_iter(series.points.iter().map(|point| point.point_count as u32)),
        )?;
        set(
            &object,
            "sourcePointIndex",
            i32_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.source_point_index.map_or(-1, |index| index as i32)),
            ),
        )?;
        set(
            &object,
            "stdDev",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.std_dev.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "sum",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.sum.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "x",
            f64_array_from_iter(series.points.iter().map(|point| point.x)),
        )?;
        set(
            &object,
            "y",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.y.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "zScore",
            f64_array_from_iter(
                series
                    .points
                    .iter()
                    .map(|point| point.z_score.unwrap_or(f64::NAN)),
            ),
        )?;
        set(
            &object,
            "summary",
            serde_wasm_bindgen::to_value(&series.summary)?,
        )?;
        Ok(object.into())
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

impl VizEngineWasmDensityIndex {
    fn from_parts(
        metric_keys: Vec<String>,
        x: Vec<f64>,
        y: Vec<f64>,
        ids: Vec<String>,
        labels: Vec<String>,
        metrics: Vec<Vec<f64>>,
        source_indices: Vec<usize>,
    ) -> VizEngineWasmDensityIndex {
        let point_count = x.len().min(y.len());
        let points = (0..point_count)
            .map(|source_index| VizSeriesPoint {
                id: ids.get(source_index).cloned().unwrap_or_default(),
                label: labels.get(source_index).cloned().unwrap_or_default(),
                x: x[source_index],
                y: y[source_index],
                metrics: metrics.get(source_index).cloned().unwrap_or_default(),
                source_index: source_indices
                    .get(source_index)
                    .copied()
                    .unwrap_or(source_index),
            })
            .collect();

        Self {
            index: VizDensityIndex::new(points, VizMetricSchema { keys: metric_keys }),
        }
    }
}

fn inflate_metric_rows(
    flat_metrics: Vec<f64>,
    point_count: usize,
    metric_count: usize,
) -> Vec<Vec<f64>> {
    if metric_count == 0 {
        return Vec::new();
    }

    (0..point_count)
        .map(|point_index| {
            let row_start = point_index * metric_count;
            (0..metric_count)
                .map(|metric_index| {
                    flat_metrics
                        .get(row_start + metric_index)
                        .copied()
                        .unwrap_or_default()
                })
                .collect()
        })
        .collect()
}

struct CompactDensityObject<'a> {
    average_y: Vec<f64>,
    first_indexes: Vec<i32>,
    last_indexes: Vec<i32>,
    max_y: Vec<f64>,
    metric_keys: &'a [String],
    metric_sums: Vec<Vec<f64>>,
    min_y: Vec<f64>,
    point_count: usize,
    counts: Vec<u32>,
    sample_count: usize,
    sum_y: Vec<f64>,
    value_mode: VizValueMode,
    x0: Vec<f64>,
    x1: Vec<f64>,
    x_domain: [f64; 2],
    y: Vec<f64>,
}

fn compact_density_object(input: CompactDensityObject<'_>) -> JsValue {
    let object = Object::new();
    set(
        &object,
        "averageY",
        Float64Array::from(input.average_y.as_slice()),
    )
    .unwrap();
    set(
        &object,
        "firstPointIndex",
        Int32Array::from(input.first_indexes.as_slice()),
    )
    .unwrap();
    set(
        &object,
        "lastPointIndex",
        Int32Array::from(input.last_indexes.as_slice()),
    )
    .unwrap();
    set(&object, "maxY", Float64Array::from(input.max_y.as_slice())).unwrap();
    set(&object, "minY", Float64Array::from(input.min_y.as_slice())).unwrap();
    set(
        &object,
        "pointCount",
        Uint32Array::from(input.counts.as_slice()),
    )
    .unwrap();
    set(&object, "sumY", Float64Array::from(input.sum_y.as_slice())).unwrap();
    set(&object, "x0", Float64Array::from(input.x0.as_slice())).unwrap();
    set(&object, "x1", Float64Array::from(input.x1.as_slice())).unwrap();
    set(&object, "y", Float64Array::from(input.y.as_slice())).unwrap();
    set(
        &object,
        "metrics",
        metric_object(
            input.metric_keys,
            &input.metric_sums,
            &(0..input.sample_count).collect::<Vec<_>>(),
        )
        .unwrap(),
    )
    .unwrap();
    set(
        &object,
        "summary",
        summary_object(&[
            ("binCount", JsValue::from_f64(input.sample_count as f64)),
            ("metricKeys", string_array(input.metric_keys).into()),
            ("pointCount", JsValue::from_f64(input.point_count as f64)),
            ("sampleCount", JsValue::from_f64(input.sample_count as f64)),
            (
                "valueMode",
                JsValue::from_str(value_mode_name(input.value_mode)),
            ),
            ("xDomain", domain_array(input.x_domain)),
        ])
        .unwrap(),
    )
    .unwrap();

    object.into()
}

fn points_in_x_domain(points: &[VizSeriesPoint], x_domain: [f64; 2]) -> &[VizSeriesPoint] {
    let start = lower_bound_x(points, x_domain[0]);
    let end = upper_bound_x(points, x_domain[1]);
    &points[start..end]
}

fn lower_bound_x(points: &[VizSeriesPoint], value: f64) -> usize {
    let mut low = 0;
    let mut high = points.len();

    while low < high {
        let mid = low + (high - low) / 2;
        if points[mid].x < value {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    low
}

fn upper_bound_x(points: &[VizSeriesPoint], value: f64) -> usize {
    let mut low = 0;
    let mut high = points.len();

    while low < high {
        let mid = low + (high - low) / 2;
        if points[mid].x <= value {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    low
}

fn normalize_domain(domain: [f64; 2]) -> [f64; 2] {
    let left = if domain[0].is_finite() {
        domain[0]
    } else {
        0.0
    };
    let right = if domain[1].is_finite() {
        domain[1]
    } else {
        left
    };

    if left <= right {
        [left, right]
    } else {
        [right, left]
    }
}

fn derive_domain(values: impl Iterator<Item = f64>) -> [f64; 2] {
    let mut finite = values.filter(|value| value.is_finite());
    let Some(first) = finite.next() else {
        return [0.0, 0.0];
    };

    finite.fold([first, first], |[min, max], value| {
        [min.min(value), max.max(value)]
    })
}

fn bin_width(domain: [f64; 2], bin_count: usize) -> f64 {
    let span = domain[1] - domain[0];

    if span > 0.0 {
        span / bin_count as f64
    } else {
        1.0
    }
}

fn bucket_index(value: f64, domain: [f64; 2], bucket_count: usize) -> usize {
    let index = ((value - domain[0]) / bin_width(domain, bucket_count)).floor() as isize;

    index.clamp(0, bucket_count as isize - 1) as usize
}

fn clamp_count(value: usize) -> usize {
    value.clamp(1, 100_000)
}

fn visible_indexes(counts: &[u32], include_empty: bool) -> Vec<usize> {
    counts
        .iter()
        .enumerate()
        .filter_map(|(index, count)| (include_empty || *count > 0).then_some(index))
        .collect()
}

fn parse_value_mode(value: &str) -> VizValueMode {
    match value {
        "count" => VizValueMode::Count,
        "max" => VizValueMode::Max,
        "min" => VizValueMode::Min,
        "sum" => VizValueMode::Sum,
        _ => VizValueMode::Average,
    }
}

fn value_mode_name(value: VizValueMode) -> &'static str {
    match value {
        VizValueMode::Average => "average",
        VizValueMode::Count => "count",
        VizValueMode::Min => "min",
        VizValueMode::Max => "max",
        VizValueMode::Sum => "sum",
        VizValueMode::P10 => "p10",
        VizValueMode::P25 => "p25",
        VizValueMode::P50 => "p50",
        VizValueMode::P75 => "p75",
        VizValueMode::P90 => "p90",
        VizValueMode::P95 => "p95",
        VizValueMode::P99 => "p99",
    }
}

fn parse_rolling_statistic(value: &str) -> VizRollingStatistic {
    match value {
        "ema" => VizRollingStatistic::Ema,
        "max" => VizRollingStatistic::Max,
        "min" => VizRollingStatistic::Min,
        "stdDev" => VizRollingStatistic::StdDev,
        "zScore" => VizRollingStatistic::ZScore,
        _ => VizRollingStatistic::Mean,
    }
}

fn compact_density_y(
    value_mode: VizValueMode,
    average_y: f64,
    point_count: u32,
    sum_y: f64,
    min_y: f64,
    max_y: f64,
) -> f64 {
    if point_count == 0 {
        return f64::NAN;
    }

    match value_mode {
        VizValueMode::Average => average_y,
        VizValueMode::Count => point_count as f64,
        VizValueMode::Min => min_y,
        VizValueMode::Max => max_y,
        VizValueMode::Sum => sum_y,
        _ => f64::NAN,
    }
}

fn f64_array_from_iter(values: impl Iterator<Item = f64>) -> Float64Array {
    let values = values.collect::<Vec<_>>();
    Float64Array::from(values.as_slice())
}

fn u32_array_from_iter(values: impl Iterator<Item = u32>) -> Uint32Array {
    let values = values.collect::<Vec<_>>();
    Uint32Array::from(values.as_slice())
}

fn i32_array_from_iter(values: impl Iterator<Item = i32>) -> Int32Array {
    let values = values.collect::<Vec<_>>();
    Int32Array::from(values.as_slice())
}

fn metric_object(
    metric_keys: &[String],
    metric_sums: &[Vec<f64>],
    visible_indexes: &[usize],
) -> Result<JsValue, JsValue> {
    let object = Object::new();
    for (metric_index, metric_key) in metric_keys.iter().enumerate() {
        set(
            &object,
            metric_key,
            f64_array_from_iter(
                visible_indexes
                    .iter()
                    .map(|index| metric_sums[metric_index][*index]),
            ),
        )?;
    }
    Ok(object.into())
}

fn metric_output_object(
    metric_keys: &[String],
    metric_arrays: &[Vec<f64>],
) -> Result<JsValue, JsValue> {
    let object = Object::new();
    for (metric_index, metric_key) in metric_keys.iter().enumerate() {
        set(
            &object,
            metric_key,
            Float64Array::from(metric_arrays[metric_index].as_slice()),
        )?;
    }
    Ok(object.into())
}

fn summary_object(entries: &[(&str, JsValue)]) -> Result<JsValue, JsValue> {
    let object = Object::new();
    for (key, value) in entries {
        set(&object, key, value.clone())?;
    }
    Ok(object.into())
}

fn domain_array(domain: [f64; 2]) -> JsValue {
    let array = Array::new();
    array.push(&JsValue::from_f64(domain[0]));
    array.push(&JsValue::from_f64(domain[1]));
    array.into()
}

fn string_array(values: &[String]) -> Array {
    let array = Array::new();
    for value in values {
        array.push(&JsValue::from_str(value));
    }
    array
}

fn set(object: &Object, key: &str, value: impl Into<JsValue>) -> Result<(), JsValue> {
    Reflect::set(object, &JsValue::from_str(key), &value.into()).map(|_| ())
}
