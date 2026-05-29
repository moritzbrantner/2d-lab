use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizFrameMetadata {
    pub backend: String,
    pub point_count: usize,
}
