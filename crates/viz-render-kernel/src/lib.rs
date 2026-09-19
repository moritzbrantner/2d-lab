#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub fn transform_batches(points: &[f32], spans: &[u32], transforms: &[f32]) -> Vec<f32> {
    assert_eq!(
        spans.len() % 2,
        0,
        "spans must contain start/length pairs"
    );

    let command_count = spans.len() / 2;
    assert_eq!(
        transforms.len(),
        command_count * 6,
        "each command must provide one affine transform"
    );

    let mut output = points.to_vec();

    for command_index in 0..command_count {
        let start = spans[command_index * 2] as usize;
        let len = spans[command_index * 2 + 1] as usize;

        assert_eq!(start % 2, 0, "point span must start on an x coordinate");
        assert_eq!(len % 2, 0, "point span must contain complete x/y pairs");
        assert!(start + len <= points.len(), "point span exceeds point buffer");

        let matrix_offset = command_index * 6;
        let a = transforms[matrix_offset];
        let b = transforms[matrix_offset + 1];
        let c = transforms[matrix_offset + 2];
        let d = transforms[matrix_offset + 3];
        let e = transforms[matrix_offset + 4];
        let f = transforms[matrix_offset + 5];

        for point_offset in (start..start + len).step_by(2) {
            let x = points[point_offset];
            let y = points[point_offset + 1];
            output[point_offset] = a * x + c * y + e;
            output[point_offset + 1] = b * x + d * y + f;
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::transform_batches;

    #[test]
    fn transforms_multiple_batches_without_touching_other_ranges() {
        let points = [
            0.0, 0.0, 2.0, 0.0,
            1.0, 1.0, 3.0, 2.0,
        ];
        let spans = [0, 4, 4, 4];
        let transforms = [
            1.0, 0.0, 0.0, 1.0, 10.0, 20.0,
            2.0, 0.0, 0.0, 3.0, -1.0, 4.0,
        ];

        let actual = transform_batches(&points, &spans, &transforms);

        assert_eq!(
            actual,
            vec![10.0, 20.0, 12.0, 20.0, 1.0, 7.0, 5.0, 10.0]
        );
    }

    #[test]
    fn supports_rotation_matrix_layout_used_by_canvas() {
        let points = [2.0, 0.0];
        let spans = [0, 2];
        let transforms = [0.0, 1.0, -1.0, 0.0, 5.0, 7.0];

        let actual = transform_batches(&points, &spans, &transforms);

        assert_eq!(actual, vec![5.0, 9.0]);
    }
}
