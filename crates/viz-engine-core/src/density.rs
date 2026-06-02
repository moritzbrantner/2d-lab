use crate::hit_test::hit_test_series_x;
use crate::types::*;
use dense_data::{
    NumericHeatmapCell, NumericHeatmapQuery, NumericSeriesIndex, NumericSeriesPoint,
    NumericValueAccessor,
};
use std::collections::{BTreeMap, VecDeque};

pub struct VizDensityIndex {
    metric_schema: VizMetricSchema,
    numeric_y_index: NumericSeriesIndex,
    points: Vec<VizSeriesPoint>,
}

impl VizDensityIndex {
    pub fn new(points: Vec<VizSeriesPoint>, metric_schema: VizMetricSchema) -> Self {
        let mut points: Vec<_> = points
            .into_iter()
            .filter(|point| point.x.is_finite() && point.y.is_finite())
            .map(|mut point| {
                point.metrics = normalize_metrics(point.metrics, metric_schema.keys.len());
                point
            })
            .collect();

        points.sort_by(|left, right| {
            left.x
                .total_cmp(&right.x)
                .then(left.source_index.cmp(&right.source_index))
        });

        let numeric_y_index = create_numeric_y_index(&points, &metric_schema);

        Self {
            metric_schema,
            numeric_y_index,
            points,
        }
    }

    pub fn points(&self) -> &[VizSeriesPoint] {
        &self.points
    }

    pub fn metric_schema(&self) -> &VizMetricSchema {
        &self.metric_schema
    }

    pub fn get_binned_series(&self, query: VizBinnedSeriesQuery) -> VizDensitySeries {
        let x_domain = normalize_domain(query.x_domain);
        let bin_count = clamp_count(query.target_bin_count);
        let width = bin_width(x_domain, bin_count);
        let requested_percentiles =
            resolve_requested_percentiles(&query.percentiles, query.value_mode);
        let mut bins: Vec<_> = (0..bin_count)
            .map(|index| self.empty_bin(index, bin_count, x_domain, width))
            .collect();

        for point in self.points_in_x_domain(x_domain) {
            let index = bucket_index(point.x, x_domain, bin_count);
            self.update_bin(&mut bins[index], point, !requested_percentiles.is_empty());
        }

        for bin in &mut bins {
            apply_percentiles(bin, &requested_percentiles);
        }

        if !query.include_empty_bins {
            bins.retain(|bin| bin.point_count > 0);
        }

        let samples = bins
            .iter()
            .map(|bin| create_sample(bin, query.value_mode))
            .collect::<Vec<_>>();

        VizDensitySeries {
            summary: VizDensitySeriesSummary {
                bin_count: bins.len(),
                metrics: sum_metric_records(bins.iter().map(|bin| &bin.metrics)),
                point_count: bins.iter().map(|bin| bin.point_count).sum(),
                sample_count: samples.len(),
                value_mode: query.value_mode,
                x_domain,
            },
            bins,
            samples,
        }
    }

    pub fn get_histogram(&self, query: VizHistogramQuery) -> VizHistogram {
        let bucket_count = clamp_count(query.bucket_count);
        let x_domain = query.x_domain.map(normalize_domain);
        let selected_points = self
            .points
            .iter()
            .filter(|point| {
                x_domain.map_or(true, |domain| point.x >= domain[0] && point.x <= domain[1])
            })
            .filter_map(|point| {
                self.point_accessor_value(point, &query.value_accessor)
                    .map(|value| (point, value))
            })
            .collect::<Vec<_>>();
        let value_domain = normalize_domain(
            query
                .value_domain
                .unwrap_or_else(|| derive_domain(selected_points.iter().map(|(_, value)| *value))),
        );
        let width = bin_width(value_domain, bucket_count);
        let mut buckets: Vec<_> = (0..bucket_count)
            .map(|index| self.empty_histogram_bucket(index, bucket_count, value_domain, width))
            .collect();

        for (point, value) in selected_points {
            if value < value_domain[0] || value > value_domain[1] {
                continue;
            }

            let index = bucket_index(value, value_domain, bucket_count);
            self.update_histogram_bucket(&mut buckets[index], point, value);
        }

        if !query.include_empty_buckets {
            buckets.retain(|bucket| bucket.point_count > 0);
        }

        VizHistogram {
            summary: VizHistogramSummary {
                bucket_count: buckets.len(),
                metrics: sum_metric_records(buckets.iter().map(|bucket| &bucket.metrics)),
                point_count: buckets.iter().map(|bucket| bucket.point_count).sum(),
                value_domain,
                x_domain,
            },
            buckets,
        }
    }

    pub fn get_heatmap(&self, query: VizHeatmapQuery) -> VizHeatmap {
        let x_bin_count = clamp_count(query.x_bin_count);
        let y_bin_count = clamp_count(query.y_bin_count);
        let x_domain = normalize_domain(query.x_domain);
        let heatmap_query = NumericHeatmapQuery {
            include_empty_cells: query.include_empty_cells,
            value_accessor: NumericValueAccessor::Y,
            x_bin_count,
            x_domain,
            y_bin_count,
            y_domain: query.y_domain.map(normalize_domain),
        };
        let heatmap = if is_default_y_accessor(&query.value_accessor) {
            self.numeric_y_index
                .get_heatmap(heatmap_query)
                .expect("viz heatmap adapter clamps bin counts and normalizes domains")
        } else {
            let numeric_points = self
                .points_in_x_domain(x_domain)
                .filter_map(|point| {
                    self.point_accessor_value(point, &query.value_accessor)
                        .map(|value| NumericSeriesPoint {
                            source_index: point.source_index,
                            x: point.x,
                            y: value,
                            metrics: self.point_metrics(point),
                        })
                })
                .collect::<Vec<_>>();
            let index = NumericSeriesIndex::from_points(numeric_points)
                .expect("viz heatmap adapter only passes finite numeric points and metrics");

            index
                .get_heatmap(heatmap_query)
                .expect("viz heatmap adapter clamps bin counts and normalizes domains")
        };
        let cells = heatmap
            .cells
            .into_iter()
            .map(|cell| numeric_heatmap_cell_to_viz(cell, &self.metric_schema))
            .collect::<Vec<_>>();

        VizHeatmap {
            summary: VizHeatmapSummary {
                max_cell_count: usize_count(heatmap.summary.max_cell_count),
                metrics: ensure_metric_schema(heatmap.summary.metrics, &self.metric_schema),
                point_count: cells.iter().map(|cell| cell.point_count).sum(),
                x_bin_count,
                x_domain: heatmap.summary.x_domain,
                y_bin_count,
                y_domain: heatmap.summary.y_domain,
            },
            cells,
        }
    }

    pub fn get_rolling_series(&self, query: VizRollingSeriesQuery) -> VizRollingSeries {
        let x_domain = normalize_domain(query.x_domain);
        let window_size = clamp_count(query.window_size);
        let min_periods = query
            .min_periods
            .unwrap_or(window_size)
            .clamp(1, window_size);
        let alpha = normalize_alpha(query.alpha, window_size);
        let selected_points = self.points_in_x_domain(x_domain).collect::<Vec<_>>();
        let mut points = Vec::with_capacity(selected_points.len());
        let mut min_queue: VecDeque<(usize, f64)> = VecDeque::new();
        let mut max_queue: VecDeque<(usize, f64)> = VecDeque::new();
        let mut sum = 0.0;
        let mut sum_squares = 0.0;
        let mut ema = None;

        for (index, point) in selected_points.iter().enumerate() {
            let value = point.y;
            ema = Some(match ema {
                Some(previous) => alpha * value + (1.0 - alpha) * previous,
                None => value,
            });

            sum += value;
            sum_squares += value * value;

            while min_queue
                .back()
                .is_some_and(|(_, queued_value)| *queued_value >= value)
            {
                min_queue.pop_back();
            }
            min_queue.push_back((index, value));

            while max_queue
                .back()
                .is_some_and(|(_, queued_value)| *queued_value <= value)
            {
                max_queue.pop_back();
            }
            max_queue.push_back((index, value));

            if index >= window_size {
                let expired_index = index - window_size;
                let expired = selected_points[expired_index].y;
                sum -= expired;
                sum_squares -= expired * expired;

                while min_queue
                    .front()
                    .is_some_and(|(queued_index, _)| *queued_index <= expired_index)
                {
                    min_queue.pop_front();
                }
                while max_queue
                    .front()
                    .is_some_and(|(queued_index, _)| *queued_index <= expired_index)
                {
                    max_queue.pop_front();
                }
            }

            let point_count = (index + 1).min(window_size);
            let has_enough_points = point_count >= min_periods;
            let (mean, min, max, std_dev, z_score, rolling_sum, rolling_ema) = if has_enough_points
            {
                let mean = sum / point_count as f64;
                let std_dev = sample_std_dev(sum, sum_squares, point_count);
                let z_score = std_dev
                    .filter(|value| *value > f64::EPSILON)
                    .map(|value| (point.y - mean) / value);

                (
                    Some(mean),
                    min_queue.front().map(|(_, value)| *value),
                    max_queue.front().map(|(_, value)| *value),
                    std_dev,
                    z_score,
                    Some(sum),
                    ema,
                )
            } else {
                (None, None, None, None, None, None, None)
            };
            let y = rolling_statistic_value(
                query.statistic,
                mean,
                min,
                max,
                std_dev,
                z_score,
                rolling_ema,
            );

            points.push(VizRollingSeriesPoint {
                ema: rolling_ema,
                index,
                max,
                mean,
                min,
                point_count,
                source_point_index: Some(point.source_index),
                statistic: query.statistic,
                std_dev,
                sum: rolling_sum,
                window_size,
                x: point.x,
                y,
                z_score,
            });
        }

        VizRollingSeries {
            summary: VizRollingSeriesSummary {
                alpha,
                min_periods,
                point_count: selected_points.len(),
                sample_count: points.iter().filter(|point| point.y.is_some()).count(),
                statistic: query.statistic,
                window_size,
                x_domain,
            },
            points,
        }
    }

    pub fn get_series_bounds(&self) -> Option<VizSeriesBounds> {
        let first = self.points.first()?;
        let mut bounds = VizSeriesBounds {
            min_x: first.x,
            max_x: first.x,
            min_y: first.y,
            max_y: first.y,
        };

        for point in &self.points {
            bounds.min_x = bounds.min_x.min(point.x);
            bounds.max_x = bounds.max_x.max(point.x);
            bounds.min_y = bounds.min_y.min(point.y);
            bounds.max_y = bounds.max_y.max(point.y);
        }

        Some(bounds)
    }

    pub fn hit_test_x(&self, query: VizHitTestQuery) -> Option<VizHitTestResult> {
        let series = self.get_binned_series(VizBinnedSeriesQuery {
            x_domain: query.x_domain,
            target_bin_count: query.target_bin_count,
            include_empty_bins: true,
            percentiles: vec![],
            value_mode: query.value_mode,
        });
        let mut result = hit_test_series_x(&series, &query)?;

        if let Some(source_index) = result.source_point_index {
            result.source_point_id = self
                .points
                .iter()
                .find(|point| point.source_index == source_index)
                .map(|point| point.id.clone())
                .filter(|id| !id.is_empty());
        }

        Some(result)
    }

    fn points_in_x_domain(&self, x_domain: [f64; 2]) -> impl Iterator<Item = &VizSeriesPoint> {
        let start = lower_bound_x(&self.points, x_domain[0]);
        let end = upper_bound_x(&self.points, x_domain[1]);

        self.points[start..end].iter()
    }

    fn empty_metrics(&self) -> BTreeMap<String, f64> {
        self.metric_schema
            .keys
            .iter()
            .map(|key| (key.clone(), 0.0))
            .collect()
    }

    fn empty_bin(
        &self,
        index: usize,
        bin_count: usize,
        x_domain: [f64; 2],
        width: f64,
    ) -> VizDensityBin {
        let x0 = x_domain[0] + index as f64 * width;

        VizDensityBin {
            average_y: None,
            first_point_index: None,
            index,
            last_point_index: None,
            max_y: None,
            metrics: self.empty_metrics(),
            min_y: None,
            p10: None,
            p25: None,
            p50: None,
            p75: None,
            p90: None,
            p95: None,
            p99: None,
            point_count: 0,
            sum_y: 0.0,
            x0,
            x1: if index + 1 == bin_count {
                x_domain[1]
            } else {
                x_domain[0] + (index + 1) as f64 * width
            },
            y_values: Vec::new(),
        }
    }

    fn update_bin(&self, bin: &mut VizDensityBin, point: &VizSeriesPoint, track_percentiles: bool) {
        bin.first_point_index.get_or_insert(point.source_index);
        bin.last_point_index = Some(point.source_index);
        bin.point_count += 1;
        bin.sum_y += point.y;
        bin.average_y = Some(bin.sum_y / bin.point_count as f64);
        bin.min_y = Some(bin.min_y.map_or(point.y, |value| value.min(point.y)));
        bin.max_y = Some(bin.max_y.map_or(point.y, |value| value.max(point.y)));
        if track_percentiles {
            bin.y_values.push(point.y);
        }
        self.add_metrics(&mut bin.metrics, point);
    }

    fn empty_histogram_bucket(
        &self,
        index: usize,
        bucket_count: usize,
        value_domain: [f64; 2],
        width: f64,
    ) -> VizHistogramBucket {
        let value0 = value_domain[0] + index as f64 * width;

        VizHistogramBucket {
            average_value: None,
            first_point_index: None,
            index,
            last_point_index: None,
            max_value: None,
            metrics: self.empty_metrics(),
            min_value: None,
            point_count: 0,
            sum_value: 0.0,
            value: value0 + width / 2.0,
            value0,
            value1: if index + 1 == bucket_count {
                value_domain[1]
            } else {
                value0 + width
            },
        }
    }

    fn update_histogram_bucket(
        &self,
        bucket: &mut VizHistogramBucket,
        point: &VizSeriesPoint,
        value: f64,
    ) {
        bucket.first_point_index.get_or_insert(point.source_index);
        bucket.last_point_index = Some(point.source_index);
        bucket.point_count += 1;
        bucket.sum_value += value;
        bucket.average_value = Some(bucket.sum_value / bucket.point_count as f64);
        bucket.min_value = Some(bucket.min_value.map_or(value, |current| current.min(value)));
        bucket.max_value = Some(bucket.max_value.map_or(value, |current| current.max(value)));
        self.add_metrics(&mut bucket.metrics, point);
    }

    fn point_metrics(&self, point: &VizSeriesPoint) -> BTreeMap<String, f64> {
        self.metric_schema
            .keys
            .iter()
            .enumerate()
            .map(|(index, key)| {
                (
                    key.clone(),
                    point.metrics.get(index).copied().unwrap_or(0.0),
                )
            })
            .collect()
    }

    fn point_accessor_value(
        &self,
        point: &VizSeriesPoint,
        accessor: &VizPointValueAccessor,
    ) -> Option<f64> {
        let value = match accessor {
            VizPointValueAccessor::Axis(axis) if axis == "x" => point.x,
            VizPointValueAccessor::Axis(_) => point.y,
            VizPointValueAccessor::Metric { metric } => {
                let metric_index = self
                    .metric_schema
                    .keys
                    .iter()
                    .position(|candidate| candidate == metric)?;

                point.metrics.get(metric_index).copied()?
            }
        };

        value.is_finite().then_some(value)
    }

    fn add_metrics(&self, target: &mut BTreeMap<String, f64>, point: &VizSeriesPoint) {
        for (index, key) in self.metric_schema.keys.iter().enumerate() {
            *target.entry(key.clone()).or_insert(0.0) +=
                point.metrics.get(index).copied().unwrap_or(0.0);
        }
    }
}

fn numeric_heatmap_cell_to_viz(
    cell: NumericHeatmapCell,
    metric_schema: &VizMetricSchema,
) -> VizHeatmapCell {
    VizHeatmapCell {
        average_value: cell.average_value,
        first_point_index: cell.first_point_index,
        index: cell.index,
        last_point_index: cell.last_point_index,
        metrics: ensure_metric_schema(cell.metrics, metric_schema),
        point_count: usize_count(cell.point_count),
        sum_value: cell.sum_value,
        value: cell.value,
        x: cell.x,
        x0: cell.x0,
        x1: cell.x1,
        x_index: cell.x_index,
        y: cell.y,
        y0: cell.y0,
        y1: cell.y1,
        y_index: cell.y_index,
    }
}

fn create_numeric_y_index(
    points: &[VizSeriesPoint],
    metric_schema: &VizMetricSchema,
) -> NumericSeriesIndex {
    NumericSeriesIndex::from_points(
        points
            .iter()
            .map(|point| NumericSeriesPoint {
                source_index: point.source_index,
                x: point.x,
                y: point.y,
                metrics: metric_schema
                    .keys
                    .iter()
                    .enumerate()
                    .map(|(index, key)| {
                        (
                            key.clone(),
                            point.metrics.get(index).copied().unwrap_or(0.0),
                        )
                    })
                    .collect(),
            })
            .collect(),
    )
    .expect("viz density index only stores finite points and normalized metrics")
}

fn is_default_y_accessor(accessor: &VizPointValueAccessor) -> bool {
    matches!(accessor, VizPointValueAccessor::Axis(axis) if axis != "x")
}

fn ensure_metric_schema(
    mut metrics: BTreeMap<String, f64>,
    metric_schema: &VizMetricSchema,
) -> BTreeMap<String, f64> {
    for key in &metric_schema.keys {
        metrics.entry(key.clone()).or_insert(0.0);
    }

    metrics
}

fn usize_count(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

fn create_sample(bin: &VizDensityBin, value_mode: VizValueMode) -> VizDensitySample {
    VizDensitySample {
        average_y: bin.average_y,
        first_point_index: bin.first_point_index,
        index: bin.index,
        last_point_index: bin.last_point_index,
        max_y: bin.max_y,
        metrics: bin.metrics.clone(),
        min_y: bin.min_y,
        p10: bin.p10,
        p25: bin.p25,
        p50: bin.p50,
        p75: bin.p75,
        p90: bin.p90,
        p95: bin.p95,
        p99: bin.p99,
        point_count: bin.point_count,
        sum_y: bin.sum_y,
        x: bin.x0 + (bin.x1 - bin.x0) / 2.0,
        x0: bin.x0,
        x1: bin.x1,
        y: sample_value(bin, value_mode),
    }
}

fn sample_value(bin: &VizDensityBin, value_mode: VizValueMode) -> Option<f64> {
    match value_mode {
        VizValueMode::Average => bin.average_y,
        VizValueMode::Count => (bin.point_count > 0).then_some(bin.point_count as f64),
        VizValueMode::Min => bin.min_y,
        VizValueMode::Max => bin.max_y,
        VizValueMode::Sum => (bin.point_count > 0).then_some(bin.sum_y),
        VizValueMode::P10 => bin.p10,
        VizValueMode::P25 => bin.p25,
        VizValueMode::P50 => bin.p50,
        VizValueMode::P75 => bin.p75,
        VizValueMode::P90 => bin.p90,
        VizValueMode::P95 => bin.p95,
        VizValueMode::P99 => bin.p99,
    }
}

fn resolve_requested_percentiles(
    percentiles: &[VizValueMode],
    value_mode: VizValueMode,
) -> Vec<VizValueMode> {
    let mut requested = Vec::new();

    for percentile in percentiles {
        if is_percentile_mode(*percentile) && !requested.contains(percentile) {
            requested.push(*percentile);
        }
    }

    if is_percentile_mode(value_mode) && !requested.contains(&value_mode) {
        requested.push(value_mode);
    }

    requested
}

fn is_percentile_mode(value_mode: VizValueMode) -> bool {
    matches!(
        value_mode,
        VizValueMode::P10
            | VizValueMode::P25
            | VizValueMode::P50
            | VizValueMode::P75
            | VizValueMode::P90
            | VizValueMode::P95
            | VizValueMode::P99
    )
}

fn apply_percentiles(bin: &mut VizDensityBin, percentiles: &[VizValueMode]) {
    if bin.point_count == 0 || percentiles.is_empty() {
        return;
    }

    bin.y_values.sort_by(f64::total_cmp);

    for percentile in percentiles {
        let value = percentile_value(
            &bin.y_values,
            match percentile {
                VizValueMode::P10 => 0.10,
                VizValueMode::P25 => 0.25,
                VizValueMode::P50 => 0.50,
                VizValueMode::P75 => 0.75,
                VizValueMode::P90 => 0.90,
                VizValueMode::P95 => 0.95,
                VizValueMode::P99 => 0.99,
                _ => continue,
            },
        );

        match percentile {
            VizValueMode::P10 => bin.p10 = value,
            VizValueMode::P25 => bin.p25 = value,
            VizValueMode::P50 => bin.p50 = value,
            VizValueMode::P75 => bin.p75 = value,
            VizValueMode::P90 => bin.p90 = value,
            VizValueMode::P95 => bin.p95 = value,
            VizValueMode::P99 => bin.p99 = value,
            _ => {}
        }
    }
}

fn percentile_value(sorted_values: &[f64], percentile: f64) -> Option<f64> {
    match sorted_values {
        [] => None,
        [value] => Some(*value),
        values => {
            let rank = percentile * (values.len() - 1) as f64;
            let lower_index = rank.floor() as usize;
            let upper_index = rank.ceil() as usize;
            let lower = values[lower_index];
            let upper = values[upper_index];

            Some(lower + (upper - lower) * (rank - lower_index as f64))
        }
    }
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

fn normalize_metrics(mut metrics: Vec<f64>, metric_count: usize) -> Vec<f64> {
    metrics.resize(metric_count, 0.0);
    metrics
        .into_iter()
        .take(metric_count)
        .map(|value| if value.is_finite() { value } else { 0.0 })
        .collect()
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

fn normalize_alpha(alpha: Option<f64>, window_size: usize) -> f64 {
    alpha
        .filter(|value| value.is_finite() && *value > 0.0 && *value <= 1.0)
        .unwrap_or(2.0 / (window_size as f64 + 1.0))
}

fn sample_std_dev(sum: f64, sum_squares: f64, point_count: usize) -> Option<f64> {
    if point_count < 2 {
        return None;
    }

    let variance =
        (sum_squares - (sum * sum) / point_count as f64) / (point_count.saturating_sub(1) as f64);

    Some(variance.max(0.0).sqrt())
}

fn rolling_statistic_value(
    statistic: VizRollingStatistic,
    mean: Option<f64>,
    min: Option<f64>,
    max: Option<f64>,
    std_dev: Option<f64>,
    z_score: Option<f64>,
    ema: Option<f64>,
) -> Option<f64> {
    match statistic {
        VizRollingStatistic::Mean => mean,
        VizRollingStatistic::Ema => ema,
        VizRollingStatistic::Min => min,
        VizRollingStatistic::Max => max,
        VizRollingStatistic::StdDev => std_dev,
        VizRollingStatistic::ZScore => z_score,
    }
}

fn sum_metric_records<'a>(
    records: impl Iterator<Item = &'a BTreeMap<String, f64>>,
) -> BTreeMap<String, f64> {
    let mut result = BTreeMap::new();

    for record in records {
        for (key, value) in record {
            *result.entry(key.clone()).or_insert(0.0) += value;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(id: &str, x: f64, y: f64, source_index: usize) -> VizSeriesPoint {
        VizSeriesPoint {
            id: id.to_string(),
            label: id.to_string(),
            x,
            y,
            metrics: vec![1.0, y],
            source_index,
        }
    }

    fn index() -> VizDensityIndex {
        VizDensityIndex::new(
            vec![
                point("c", 20.0, 8.0, 2),
                point("a", 0.0, 2.0, 0),
                point("bad", f64::NAN, 1.0, 5),
                point("b", 10.0, 4.0, 1),
                point("d", 30.0, 16.0, 3),
                point("e", 40.0, 32.0, 4),
            ],
            VizMetricSchema {
                keys: vec!["count".to_string(), "weight".to_string()],
            },
        )
    }

    #[test]
    fn x_bounds_handle_empty_duplicate_and_inclusive_end_values() {
        let empty = Vec::<VizSeriesPoint>::new();
        let points = vec![
            point("a", 0.0, 0.0, 0),
            point("b", 10.0, 10.0, 1),
            point("c", 10.0, 10.0, 2),
            point("d", 20.0, 20.0, 3),
        ];

        assert_eq!(lower_bound_x(&empty, 10.0), 0);
        assert_eq!(upper_bound_x(&empty, 10.0), 0);
        assert_eq!(lower_bound_x(&points, 10.0), 1);
        assert_eq!(upper_bound_x(&points, 10.0), 3);
        assert_eq!(lower_bound_x(&points, -1.0), 0);
        assert_eq!(upper_bound_x(&points, 99.0), points.len());
    }

    #[test]
    fn x_domain_queries_keep_inclusive_upper_bound_after_normalization() {
        let index = VizDensityIndex::new(
            vec![
                point("a", 0.0, 0.0, 0),
                point("b", 10.0, 10.0, 1),
                point("c", 20.0, 20.0, 2),
            ],
            VizMetricSchema::default(),
        );
        let series = index.get_binned_series(VizBinnedSeriesQuery {
            include_empty_bins: false,
            percentiles: vec![],
            target_bin_count: 2,
            value_mode: VizValueMode::Average,
            x_domain: [20.0, 10.0],
        });

        assert_eq!(series.summary.point_count, 2);
        assert_eq!(
            series.bins.iter().map(|bin| bin.point_count).sum::<usize>(),
            2
        );
    }

    #[test]
    fn normalizes_and_sorts_points() {
        let index = index();

        assert_eq!(
            index
                .points()
                .iter()
                .map(|point| point.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b", "c", "d", "e"]
        );
        assert_eq!(index.points().len(), 5);
    }

    #[test]
    fn computes_bounds() {
        assert_eq!(
            index().get_series_bounds(),
            Some(VizSeriesBounds {
                min_x: 0.0,
                max_x: 40.0,
                min_y: 2.0,
                max_y: 32.0,
            })
        );
    }

    #[test]
    fn normalizes_metrics_to_the_schema() {
        let index = VizDensityIndex::new(
            vec![
                VizSeriesPoint {
                    id: "a".to_string(),
                    label: "a".to_string(),
                    x: 0.0,
                    y: 1.0,
                    metrics: vec![f64::NAN, 2.0, 99.0],
                    source_index: 0,
                },
                VizSeriesPoint {
                    id: "b".to_string(),
                    label: "b".to_string(),
                    x: 1.0,
                    y: 2.0,
                    metrics: vec![3.0],
                    source_index: 1,
                },
            ],
            VizMetricSchema {
                keys: vec!["count".to_string(), "weight".to_string()],
            },
        );

        assert_eq!(index.points()[0].metrics, vec![0.0, 2.0]);
        assert_eq!(index.points()[1].metrics, vec![3.0, 0.0]);
    }

    #[test]
    fn bins_points_into_series() {
        let series = index().get_binned_series(VizBinnedSeriesQuery {
            x_domain: [0.0, 40.0],
            target_bin_count: 4,
            include_empty_bins: false,
            percentiles: vec![],
            value_mode: VizValueMode::Average,
        });

        assert_eq!(
            series
                .bins
                .iter()
                .map(|bin| bin.point_count)
                .collect::<Vec<_>>(),
            vec![1, 1, 1, 2]
        );
        assert_eq!(
            series
                .samples
                .iter()
                .map(|sample| sample.y)
                .collect::<Vec<_>>(),
            vec![Some(2.0), Some(4.0), Some(8.0), Some(24.0)]
        );
    }

    #[test]
    fn normalizes_reversed_domains_and_clamps_zero_counts() {
        let series = index().get_binned_series(VizBinnedSeriesQuery {
            x_domain: [40.0, 0.0],
            target_bin_count: 0,
            include_empty_bins: true,
            percentiles: vec![],
            value_mode: VizValueMode::Average,
        });

        assert_eq!(series.bins.len(), 1);
        assert_eq!(series.bins[0].x0, 0.0);
        assert_eq!(series.bins[0].x1, 40.0);
        assert_eq!(series.bins[0].point_count, 5);
        assert_eq!(series.summary.x_domain, [0.0, 40.0]);
    }

    #[test]
    fn supports_empty_bins() {
        let series = index().get_binned_series(VizBinnedSeriesQuery {
            x_domain: [0.0, 40.0],
            target_bin_count: 8,
            include_empty_bins: true,
            percentiles: vec![],
            value_mode: VizValueMode::Average,
        });

        assert_eq!(series.bins.len(), 8);
        assert_eq!(
            series
                .bins
                .iter()
                .filter(|bin| bin.point_count == 0)
                .count(),
            3
        );
    }

    #[test]
    fn summarizes_binned_series_metrics() {
        let series = index().get_binned_series(VizBinnedSeriesQuery {
            x_domain: [0.0, 40.0],
            target_bin_count: 4,
            include_empty_bins: true,
            percentiles: vec![],
            value_mode: VizValueMode::Average,
        });

        assert_eq!(series.summary.metrics.get("count"), Some(&5.0));
        assert_eq!(series.summary.metrics.get("weight"), Some(&62.0));
        assert_eq!(series.summary.point_count, 5);
        assert_eq!(series.summary.sample_count, 4);
    }

    #[test]
    fn supports_value_modes() {
        let modes = [
            (VizValueMode::Average, Some(24.0)),
            (VizValueMode::Count, Some(2.0)),
            (VizValueMode::Min, Some(16.0)),
            (VizValueMode::Max, Some(32.0)),
            (VizValueMode::Sum, Some(48.0)),
        ];

        for (value_mode, expected) in modes {
            let series = index().get_binned_series(VizBinnedSeriesQuery {
                x_domain: [0.0, 40.0],
                target_bin_count: 4,
                include_empty_bins: true,
                percentiles: vec![],
                value_mode,
            });

            assert_eq!(series.samples[3].y, expected);
        }
    }

    #[test]
    fn computes_rolling_window_statistics() {
        let series = index().get_rolling_series(VizRollingSeriesQuery {
            alpha: Some(0.5),
            x_domain: [0.0, 40.0],
            min_periods: Some(2),
            statistic: VizRollingStatistic::ZScore,
            window_size: 3,
        });

        assert_eq!(series.summary.window_size, 3);
        assert_eq!(series.summary.min_periods, 2);
        assert_eq!(series.summary.sample_count, 4);
        assert_eq!(
            series
                .points
                .iter()
                .map(|point| point.x)
                .collect::<Vec<_>>(),
            vec![0.0, 10.0, 20.0, 30.0, 40.0]
        );
        assert_eq!(series.points[0].y, None);
        assert_eq!(series.points[1].mean, Some(3.0));
        assert_eq!(series.points[1].min, Some(2.0));
        assert_eq!(series.points[1].max, Some(4.0));
        assert_eq!(series.points[1].sum, Some(6.0));
        assert_eq!(series.points[1].ema, Some(3.0));
        assert_close(series.points[1].std_dev.unwrap(), 2.0_f64.sqrt());
        assert_close(series.points[1].z_score.unwrap(), 1.0 / 2.0_f64.sqrt());
        assert_close(series.points[2].mean.unwrap(), 14.0 / 3.0);
        assert_eq!(series.points[3].min, Some(4.0));
        assert_eq!(series.points[3].max, Some(16.0));
        assert_close(series.points[3].ema.unwrap(), 10.75);
    }

    #[test]
    fn uses_complete_windows_by_default_for_rolling_series() {
        let series = index().get_rolling_series(VizRollingSeriesQuery {
            alpha: None,
            x_domain: [40.0, 0.0],
            min_periods: None,
            statistic: VizRollingStatistic::Mean,
            window_size: 3,
        });

        assert_eq!(series.summary.x_domain, [0.0, 40.0]);
        assert_eq!(series.summary.alpha, 0.5);
        assert_eq!(
            series
                .points
                .iter()
                .map(|point| point.y)
                .collect::<Vec<_>>(),
            vec![
                None,
                None,
                Some(14.0 / 3.0),
                Some(28.0 / 3.0),
                Some(56.0 / 3.0)
            ]
        );
    }

    #[test]
    fn computes_histogram_buckets() {
        let histogram = index().get_histogram(VizHistogramQuery {
            bucket_count: 4,
            include_empty_buckets: true,
            value_accessor: VizPointValueAccessor::default(),
            value_domain: None,
            x_domain: Some([0.0, 40.0]),
        });

        assert_eq!(
            histogram
                .buckets
                .iter()
                .map(|bucket| bucket.point_count)
                .collect::<Vec<_>>(),
            vec![3, 1, 0, 1]
        );
        assert_eq!(histogram.summary.value_domain, [2.0, 32.0]);
    }

    #[test]
    fn filters_empty_histogram_buckets_and_applies_x_domain() {
        let histogram = index().get_histogram(VizHistogramQuery {
            bucket_count: 4,
            include_empty_buckets: false,
            value_accessor: VizPointValueAccessor::default(),
            value_domain: Some([0.0, 40.0]),
            x_domain: Some([0.0, 20.0]),
        });

        assert_eq!(
            histogram
                .buckets
                .iter()
                .map(|bucket| bucket.point_count)
                .collect::<Vec<_>>(),
            vec![3]
        );
        assert_eq!(histogram.summary.point_count, 3);
        assert_eq!(histogram.summary.metrics.get("count"), Some(&3.0));
        assert_eq!(histogram.summary.metrics.get("weight"), Some(&14.0));
    }

    #[test]
    fn computes_heatmap_cells() {
        let heatmap = index().get_heatmap(VizHeatmapQuery {
            x_bin_count: 4,
            x_domain: [0.0, 40.0],
            y_bin_count: 4,
            value_accessor: VizPointValueAccessor::default(),
            y_domain: Some([0.0, 40.0]),
            include_empty_cells: true,
        });

        assert_eq!(heatmap.cells.len(), 16);
        assert_eq!(heatmap.summary.max_cell_count, 1);
        assert_eq!(heatmap.summary.point_count, 5);
    }

    #[test]
    fn filters_empty_heatmap_cells_and_keeps_boundary_points() {
        let heatmap = index().get_heatmap(VizHeatmapQuery {
            x_bin_count: 2,
            x_domain: [0.0, 40.0],
            y_bin_count: 2,
            value_accessor: VizPointValueAccessor::default(),
            y_domain: Some([0.0, 40.0]),
            include_empty_cells: false,
        });

        assert_eq!(
            heatmap
                .cells
                .iter()
                .map(|cell| (cell.x_index, cell.y_index, cell.point_count, cell.value))
                .collect::<Vec<_>>(),
            vec![(0, 0, 2, 1.0), (1, 0, 2, 1.0), (1, 1, 1, 0.5)]
        );
        assert_eq!(heatmap.summary.metrics.get("count"), Some(&5.0));
        assert_eq!(heatmap.summary.metrics.get("weight"), Some(&62.0));
    }

    #[test]
    fn heatmap_uses_metric_accessor_and_normalizes_reversed_domains() {
        let index = VizDensityIndex::new(
            vec![
                VizSeriesPoint {
                    id: "low".to_string(),
                    label: "low".to_string(),
                    x: 0.0,
                    y: 100.0,
                    metrics: vec![1.0, 2.0],
                    source_index: 0,
                },
                VizSeriesPoint {
                    id: "high-a".to_string(),
                    label: "high-a".to_string(),
                    x: 10.0,
                    y: 200.0,
                    metrics: vec![9.0, 3.0],
                    source_index: 1,
                },
                VizSeriesPoint {
                    id: "high-b".to_string(),
                    label: "high-b".to_string(),
                    x: 10.0,
                    y: 300.0,
                    metrics: vec![9.0, 4.0],
                    source_index: 2,
                },
            ],
            VizMetricSchema {
                keys: vec!["heat".to_string(), "extra".to_string()],
            },
        );
        let heatmap = index.get_heatmap(VizHeatmapQuery {
            include_empty_cells: false,
            value_accessor: VizPointValueAccessor::Metric {
                metric: "heat".to_string(),
            },
            x_bin_count: 2,
            x_domain: [10.0, 0.0],
            y_bin_count: 2,
            y_domain: Some([10.0, 0.0]),
        });

        assert_eq!(heatmap.summary.x_domain, [0.0, 10.0]);
        assert_eq!(heatmap.summary.y_domain, [0.0, 10.0]);
        assert_eq!(heatmap.summary.max_cell_count, 2);
        assert_eq!(
            heatmap
                .cells
                .iter()
                .map(|cell| (cell.x_index, cell.y_index, cell.point_count, cell.value))
                .collect::<Vec<_>>(),
            vec![(0, 0, 1, 0.5), (1, 1, 2, 1.0)]
        );
        assert_eq!(heatmap.cells[1].sum_value, 18.0);
        assert_eq!(heatmap.cells[1].average_value, Some(9.0));
        assert_eq!(heatmap.cells[1].metrics.get("heat"), Some(&18.0));
        assert_eq!(heatmap.cells[1].metrics.get("extra"), Some(&7.0));
    }

    #[test]
    fn handles_empty_indexes() {
        let index = VizDensityIndex::new(
            vec![],
            VizMetricSchema {
                keys: vec!["count".to_string()],
            },
        );

        assert_eq!(index.get_series_bounds(), None);

        let histogram = index.get_histogram(VizHistogramQuery {
            bucket_count: 0,
            include_empty_buckets: true,
            value_accessor: VizPointValueAccessor::default(),
            value_domain: None,
            x_domain: None,
        });

        assert_eq!(histogram.summary.value_domain, [0.0, 0.0]);
        assert_eq!(histogram.buckets.len(), 1);

        let heatmap = index.get_heatmap(VizHeatmapQuery {
            x_bin_count: 0,
            x_domain: [f64::NAN, f64::INFINITY],
            y_bin_count: 0,
            value_accessor: VizPointValueAccessor::default(),
            y_domain: None,
            include_empty_cells: true,
        });

        assert_eq!(heatmap.summary.x_domain, [0.0, 0.0]);
        assert_eq!(heatmap.summary.y_domain, [0.0, 0.0]);
        assert_eq!(heatmap.cells.len(), 1);
    }

    #[test]
    fn performs_x_hit_testing() {
        let result = index().hit_test_x(VizHitTestQuery {
            x: 19.0,
            x_domain: [0.0, 40.0],
            target_bin_count: 5,
            value_mode: VizValueMode::Average,
        });

        assert_eq!(
            result,
            Some(VizHitTestResult {
                point_count: 1,
                sample_index: 2,
                source_point_id: Some("c".to_string()),
                source_point_index: Some(2),
                x: 20.0,
                y: Some(8.0),
            })
        );
    }

    #[test]
    fn returns_none_when_hit_testing_empty_series() {
        let index = VizDensityIndex::new(vec![], VizMetricSchema { keys: vec![] });

        assert_eq!(
            index.hit_test_x(VizHitTestQuery {
                x: 19.0,
                x_domain: [0.0, 40.0],
                target_bin_count: 5,
                value_mode: VizValueMode::Average,
            }),
            None
        );
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-12,
            "expected {actual} to be close to {expected}"
        );
    }
}
