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
