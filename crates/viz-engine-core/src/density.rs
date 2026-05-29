use crate::hit_test::hit_test_series_x;
use crate::types::*;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub struct VizDensityIndex {
    metric_schema: VizMetricSchema,
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

        Self {
            metric_schema,
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
        let mut bins: Vec<_> = (0..bin_count)
            .map(|index| self.empty_bin(index, bin_count, x_domain, width))
            .collect();

        for point in self.points_in_x_domain(x_domain) {
            let index = bucket_index(point.x, x_domain, bin_count);
            self.update_bin(&mut bins[index], point);
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
            .collect::<Vec<_>>();
        let value_domain = normalize_domain(
            query
                .value_domain
                .unwrap_or_else(|| derive_domain(selected_points.iter().map(|point| point.y))),
        );
        let width = bin_width(value_domain, bucket_count);
        let mut buckets: Vec<_> = (0..bucket_count)
            .map(|index| self.empty_histogram_bucket(index, bucket_count, value_domain, width))
            .collect();

        for point in selected_points {
            if point.y < value_domain[0] || point.y > value_domain[1] {
                continue;
            }

            let index = bucket_index(point.y, value_domain, bucket_count);
            self.update_histogram_bucket(&mut buckets[index], point);
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
        let selected_points = self.points_in_x_domain(x_domain).collect::<Vec<_>>();
        let y_domain = normalize_domain(
            query
                .y_domain
                .unwrap_or_else(|| derive_domain(selected_points.iter().map(|point| point.y))),
        );
        let x_width = bin_width(x_domain, x_bin_count);
        let y_width = bin_width(y_domain, y_bin_count);
        let mut cells: Vec<_> = (0..(x_bin_count * y_bin_count))
            .map(|index| {
                self.empty_heatmap_cell(
                    index,
                    x_bin_count,
                    y_bin_count,
                    x_domain,
                    y_domain,
                    x_width,
                    y_width,
                )
            })
            .collect();

        for point in selected_points {
            if point.y < y_domain[0] || point.y > y_domain[1] {
                continue;
            }

            let x_index = bucket_index(point.x, x_domain, x_bin_count);
            let y_index = bucket_index(point.y, y_domain, y_bin_count);
            self.update_heatmap_cell(&mut cells[y_index * x_bin_count + x_index], point);
        }

        let max_cell_count = cells.iter().map(|cell| cell.point_count).max().unwrap_or(0);

        for cell in &mut cells {
            cell.value = if max_cell_count > 0 {
                cell.point_count as f64 / max_cell_count as f64
            } else {
                0.0
            };
        }

        if !query.include_empty_cells {
            cells.retain(|cell| cell.point_count > 0);
        }

        VizHeatmap {
            summary: VizHeatmapSummary {
                max_cell_count,
                metrics: sum_metric_records(cells.iter().map(|cell| &cell.metrics)),
                point_count: cells.iter().map(|cell| cell.point_count).sum(),
                x_bin_count,
                x_domain,
                y_bin_count,
                y_domain,
            },
            cells,
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
        self.points
            .iter()
            .filter(move |point| point.x >= x_domain[0] && point.x <= x_domain[1])
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
            point_count: 0,
            sum_y: 0.0,
            x0,
            x1: if index + 1 == bin_count {
                x_domain[1]
            } else {
                x0 + width
            },
        }
    }

    fn update_bin(&self, bin: &mut VizDensityBin, point: &VizSeriesPoint) {
        bin.first_point_index.get_or_insert(point.source_index);
        bin.last_point_index = Some(point.source_index);
        bin.point_count += 1;
        bin.sum_y += point.y;
        bin.average_y = Some(bin.sum_y / bin.point_count as f64);
        bin.min_y = Some(bin.min_y.map_or(point.y, |value| value.min(point.y)));
        bin.max_y = Some(bin.max_y.map_or(point.y, |value| value.max(point.y)));
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

    fn update_histogram_bucket(&self, bucket: &mut VizHistogramBucket, point: &VizSeriesPoint) {
        bucket.first_point_index.get_or_insert(point.source_index);
        bucket.last_point_index = Some(point.source_index);
        bucket.point_count += 1;
        bucket.sum_value += point.y;
        bucket.average_value = Some(bucket.sum_value / bucket.point_count as f64);
        bucket.min_value = Some(bucket.min_value.map_or(point.y, |value| value.min(point.y)));
        bucket.max_value = Some(bucket.max_value.map_or(point.y, |value| value.max(point.y)));
        self.add_metrics(&mut bucket.metrics, point);
    }

    #[allow(clippy::too_many_arguments)]
    fn empty_heatmap_cell(
        &self,
        index: usize,
        x_bin_count: usize,
        y_bin_count: usize,
        x_domain: [f64; 2],
        y_domain: [f64; 2],
        x_width: f64,
        y_width: f64,
    ) -> VizHeatmapCell {
        let x_index = index % x_bin_count;
        let y_index = index / x_bin_count;
        let x0 = x_domain[0] + x_index as f64 * x_width;
        let y0 = y_domain[0] + y_index as f64 * y_width;

        VizHeatmapCell {
            average_value: None,
            first_point_index: None,
            index,
            last_point_index: None,
            metrics: self.empty_metrics(),
            point_count: 0,
            sum_value: 0.0,
            value: 0.0,
            x: x0 + x_width / 2.0,
            x0,
            x1: if x_index + 1 == x_bin_count {
                x_domain[1]
            } else {
                x0 + x_width
            },
            x_index,
            y: y0 + y_width / 2.0,
            y0,
            y1: if y_index + 1 == y_bin_count {
                y_domain[1]
            } else {
                y0 + y_width
            },
            y_index,
        }
    }

    fn update_heatmap_cell(&self, cell: &mut VizHeatmapCell, point: &VizSeriesPoint) {
        cell.first_point_index.get_or_insert(point.source_index);
        cell.last_point_index = Some(point.source_index);
        cell.point_count += 1;
        cell.sum_value += point.y;
        cell.average_value = Some(cell.sum_value / cell.point_count as f64);
        self.add_metrics(&mut cell.metrics, point);
    }

    fn add_metrics(&self, target: &mut BTreeMap<String, f64>, point: &VizSeriesPoint) {
        for (index, key) in self.metric_schema.keys.iter().enumerate() {
            *target.entry(key.clone()).or_insert(0.0) +=
                point.metrics.get(index).copied().unwrap_or(0.0);
        }
    }
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
        VizValueMode::Count => Some(bin.point_count as f64),
        VizValueMode::Min => bin.min_y,
        VizValueMode::Max => bin.max_y,
        VizValueMode::Sum => (bin.point_count > 0).then_some(bin.sum_y),
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
                value_mode,
            });

            assert_eq!(series.samples[3].y, expected);
        }
    }

    #[test]
    fn computes_histogram_buckets() {
        let histogram = index().get_histogram(VizHistogramQuery {
            bucket_count: 4,
            include_empty_buckets: true,
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
            value_domain: None,
            x_domain: None,
        });

        assert_eq!(histogram.summary.value_domain, [0.0, 0.0]);
        assert_eq!(histogram.buckets.len(), 1);

        let heatmap = index.get_heatmap(VizHeatmapQuery {
            x_bin_count: 0,
            x_domain: [f64::NAN, f64::INFINITY],
            y_bin_count: 0,
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
}
