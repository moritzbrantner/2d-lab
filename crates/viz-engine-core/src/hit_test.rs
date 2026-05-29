use crate::types::{VizDensitySeries, VizHitTestQuery, VizHitTestResult};

pub fn hit_test_series_x(
    series: &VizDensitySeries,
    query: &VizHitTestQuery,
) -> Option<VizHitTestResult> {
    let mut nearest: Option<(&crate::types::VizDensitySample, f64)> = None;

    for sample in series
        .samples
        .iter()
        .filter(|sample| sample.point_count > 0)
    {
        let distance = (sample.x - query.x).abs();

        if nearest.map_or(true, |(_, nearest_distance)| distance < nearest_distance) {
            nearest = Some((sample, distance));
        }
    }

    nearest.map(|(sample, _)| VizHitTestResult {
        point_count: sample.point_count,
        sample_index: sample.index,
        source_point_id: None,
        source_point_index: sample.first_point_index.or(sample.last_point_index),
        x: sample.x,
        y: sample.y,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{VizDensityBin, VizDensitySample, VizDensitySeriesSummary, VizValueMode};
    use std::collections::BTreeMap;

    fn sample(index: usize, x: f64, point_count: usize) -> VizDensitySample {
        VizDensitySample {
            average_y: (point_count > 0).then_some(x),
            first_point_index: (point_count > 0).then_some(index),
            index,
            last_point_index: (point_count > 0).then_some(index + 10),
            max_y: (point_count > 0).then_some(x),
            metrics: BTreeMap::new(),
            min_y: (point_count > 0).then_some(x),
            point_count,
            sum_y: if point_count > 0 { x } else { 0.0 },
            x,
            x0: x - 1.0,
            x1: x + 1.0,
            y: (point_count > 0).then_some(x),
        }
    }

    fn series(samples: Vec<VizDensitySample>) -> VizDensitySeries {
        VizDensitySeries {
            bins: samples
                .iter()
                .map(|sample| VizDensityBin {
                    average_y: sample.average_y,
                    first_point_index: sample.first_point_index,
                    index: sample.index,
                    last_point_index: sample.last_point_index,
                    max_y: sample.max_y,
                    metrics: sample.metrics.clone(),
                    min_y: sample.min_y,
                    point_count: sample.point_count,
                    sum_y: sample.sum_y,
                    x0: sample.x0,
                    x1: sample.x1,
                })
                .collect(),
            summary: VizDensitySeriesSummary {
                bin_count: samples.len(),
                metrics: BTreeMap::new(),
                point_count: samples.iter().map(|sample| sample.point_count).sum(),
                sample_count: samples.len(),
                value_mode: VizValueMode::Average,
                x_domain: [0.0, 40.0],
            },
            samples,
        }
    }

    fn query(x: f64) -> VizHitTestQuery {
        VizHitTestQuery {
            x,
            x_domain: [0.0, 40.0],
            target_bin_count: 4,
            value_mode: VizValueMode::Average,
        }
    }

    #[test]
    fn returns_none_when_all_samples_are_empty() {
        assert_eq!(
            hit_test_series_x(
                &series(vec![sample(0, 0.0, 0), sample(1, 10.0, 0)]),
                &query(5.0)
            ),
            None
        );
    }

    #[test]
    fn ignores_empty_samples_and_chooses_nearest_x() {
        assert_eq!(
            hit_test_series_x(
                &series(vec![
                    sample(0, 0.0, 0),
                    sample(1, 10.0, 1),
                    sample(2, 20.0, 1)
                ]),
                &query(18.0),
            ),
            Some(VizHitTestResult {
                point_count: 1,
                sample_index: 2,
                source_point_id: None,
                source_point_index: Some(2),
                x: 20.0,
                y: Some(20.0),
            })
        );
    }

    #[test]
    fn keeps_first_match_on_equal_distance() {
        assert_eq!(
            hit_test_series_x(
                &series(vec![sample(1, 10.0, 1), sample(2, 20.0, 1)]),
                &query(15.0)
            )
            .map(|result| result.sample_index),
            Some(1)
        );
    }

    #[test]
    fn falls_back_to_last_point_index() {
        let mut only_last = sample(1, 10.0, 1);
        only_last.first_point_index = None;

        assert_eq!(
            hit_test_series_x(&series(vec![only_last]), &query(10.0))
                .and_then(|result| result.source_point_index),
            Some(11)
        );
    }
}
