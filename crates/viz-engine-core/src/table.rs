use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VizTableColumnType {
    Number,
    Date,
    Boolean,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VizTableSortDirection {
    Asc,
    Desc,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VizTableNulls {
    First,
    Last,
}

impl Default for VizTableNulls {
    fn default() -> Self {
        Self::Last
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VizTableNumericFilterOperator {
    Equals,
    NotEquals,
    Gt,
    Gte,
    Lt,
    Lte,
    Between,
    IsNull,
    IsNotNull,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableNumericFilter {
    pub column_index: usize,
    pub operator: VizTableNumericFilterOperator,
    #[serde(default)]
    pub value: Option<f64>,
    #[serde(default)]
    pub max_value: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableSort {
    pub column_index: usize,
    pub direction: VizTableSortDirection,
    #[serde(default)]
    pub nulls: VizTableNulls,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableQuery {
    #[serde(default)]
    pub filters: Vec<VizTableNumericFilter>,
    #[serde(default)]
    pub row_limit: Option<usize>,
    #[serde(default)]
    pub row_offset: usize,
    #[serde(default)]
    pub sort: Option<VizTableSort>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableNumericColumn {
    pub column_type: VizTableColumnType,
    pub values: Vec<f64>,
    #[serde(default)]
    pub validity: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableBooleanColumn {
    pub values: Vec<u8>,
    #[serde(default)]
    pub validity: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableIndexResult {
    pub filtered_row_count: usize,
    pub row_indices: Vec<u32>,
}

pub fn filter_numeric_rows(
    column: &VizTableNumericColumn,
    filter: &VizTableNumericFilter,
) -> Vec<u32> {
    let rows = all_rows(column.values.len());
    filter_numeric_rows_subset(column, filter, &rows)
}

pub fn filter_boolean_rows(
    column: &VizTableBooleanColumn,
    operator: VizTableNumericFilterOperator,
    value: Option<bool>,
) -> Vec<u32> {
    let rows = all_rows(column.values.len());
    filter_boolean_rows_subset(column, operator, value, &rows)
}

pub fn sort_numeric_rows(
    column: &VizTableNumericColumn,
    rows: &[u32],
    sort: VizTableSort,
) -> Vec<u32> {
    let mut output = rows.to_vec();
    output.sort_by(|left, right| {
        compare_optional_numeric(
            numeric_value(column, *left as usize),
            numeric_value(column, *right as usize),
            sort.direction,
            sort.nulls,
        )
        .then(left.cmp(right))
    });
    output
}

pub fn sort_boolean_rows(
    column: &VizTableBooleanColumn,
    rows: &[u32],
    sort: VizTableSort,
) -> Vec<u32> {
    let mut output = rows.to_vec();
    output.sort_by(|left, right| {
        compare_optional_bool(
            boolean_value(column, *left as usize),
            boolean_value(column, *right as usize),
            sort.direction,
            sort.nulls,
        )
        .then(left.cmp(right))
    });
    output
}

pub fn window_rows(rows: &[u32], row_offset: usize, row_limit: Option<usize>) -> Vec<u32> {
    let limit = row_limit.unwrap_or(100);
    if limit == 0 || row_offset >= rows.len() {
        return Vec::new();
    }

    rows.iter().skip(row_offset).take(limit).copied().collect()
}

pub fn query_numeric_table(
    columns: &[VizTableNumericColumn],
    query: &VizTableQuery,
) -> VizTableIndexResult {
    let row_count = columns.first().map_or(0, |column| column.values.len());
    let mut rows = all_rows(row_count);

    for filter in &query.filters {
        let Some(column) = columns.get(filter.column_index) else {
            return VizTableIndexResult {
                filtered_row_count: 0,
                row_indices: Vec::new(),
            };
        };
        rows = filter_numeric_rows_subset(column, filter, &rows);
    }

    let filtered_row_count = rows.len();
    if let Some(sort) = query.sort {
        if let Some(column) = columns.get(sort.column_index) {
            rows = sort_numeric_rows(column, &rows, sort);
        }
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices: window_rows(&rows, query.row_offset, query.row_limit),
    }
}

fn filter_numeric_rows_subset(
    column: &VizTableNumericColumn,
    filter: &VizTableNumericFilter,
    rows: &[u32],
) -> Vec<u32> {
    rows.iter()
        .copied()
        .filter(|row| numeric_row_matches(column, *row as usize, filter))
        .collect()
}

fn filter_boolean_rows_subset(
    column: &VizTableBooleanColumn,
    operator: VizTableNumericFilterOperator,
    value: Option<bool>,
    rows: &[u32],
) -> Vec<u32> {
    rows.iter()
        .copied()
        .filter(|row| {
            let actual = boolean_value(column, *row as usize);
            match operator {
                VizTableNumericFilterOperator::Equals => actual == value,
                VizTableNumericFilterOperator::NotEquals => actual != value,
                VizTableNumericFilterOperator::IsNull => actual.is_none(),
                VizTableNumericFilterOperator::IsNotNull => actual.is_some(),
                _ => false,
            }
        })
        .collect()
}

fn numeric_row_matches(
    column: &VizTableNumericColumn,
    row_index: usize,
    filter: &VizTableNumericFilter,
) -> bool {
    let actual = numeric_value(column, row_index);
    match filter.operator {
        VizTableNumericFilterOperator::Equals => actual == filter.value,
        VizTableNumericFilterOperator::NotEquals => actual != filter.value,
        VizTableNumericFilterOperator::Gt => {
            compare_numeric(actual, filter.value, Ordering::Greater)
        }
        VizTableNumericFilterOperator::Gte => {
            matches!(
                (actual, filter.value),
                (Some(left), Some(right)) if left >= right
            )
        }
        VizTableNumericFilterOperator::Lt => compare_numeric(actual, filter.value, Ordering::Less),
        VizTableNumericFilterOperator::Lte => {
            matches!(
                (actual, filter.value),
                (Some(left), Some(right)) if left <= right
            )
        }
        VizTableNumericFilterOperator::Between => {
            matches!(
                (actual, filter.value, filter.max_value),
                (Some(value), Some(min), Some(max)) if value >= min && value <= max
            )
        }
        VizTableNumericFilterOperator::IsNull => actual.is_none(),
        VizTableNumericFilterOperator::IsNotNull => actual.is_some(),
    }
}

fn compare_numeric(left: Option<f64>, right: Option<f64>, ordering: Ordering) -> bool {
    matches!((left, right), (Some(left), Some(right)) if left.total_cmp(&right) == ordering)
}

fn compare_optional_numeric(
    left: Option<f64>,
    right: Option<f64>,
    direction: VizTableSortDirection,
    nulls: VizTableNulls,
) -> Ordering {
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => null_order(nulls),
        (Some(_), None) => null_order(nulls).reverse(),
        (Some(left), Some(right)) => match direction {
            VizTableSortDirection::Asc => left.total_cmp(&right),
            VizTableSortDirection::Desc => right.total_cmp(&left),
        },
    }
}

fn compare_optional_bool(
    left: Option<bool>,
    right: Option<bool>,
    direction: VizTableSortDirection,
    nulls: VizTableNulls,
) -> Ordering {
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => null_order(nulls),
        (Some(_), None) => null_order(nulls).reverse(),
        (Some(left), Some(right)) => {
            let ordering = left.cmp(&right);
            match direction {
                VizTableSortDirection::Asc => ordering,
                VizTableSortDirection::Desc => ordering.reverse(),
            }
        }
    }
}

fn null_order(nulls: VizTableNulls) -> Ordering {
    match nulls {
        VizTableNulls::First => Ordering::Less,
        VizTableNulls::Last => Ordering::Greater,
    }
}

fn numeric_value(column: &VizTableNumericColumn, row_index: usize) -> Option<f64> {
    if !is_valid(column.validity.as_deref(), row_index) {
        return None;
    }
    let value = *column.values.get(row_index)?;
    value.is_finite().then_some(value)
}

fn boolean_value(column: &VizTableBooleanColumn, row_index: usize) -> Option<bool> {
    if !is_valid(column.validity.as_deref(), row_index) {
        return None;
    }
    column.values.get(row_index).map(|value| *value != 0)
}

fn is_valid(validity: Option<&[u8]>, row_index: usize) -> bool {
    validity
        .and_then(|values| values.get(row_index))
        .map_or(true, |value| *value != 0)
}

fn all_rows(row_count: usize) -> Vec<u32> {
    (0..row_count).map(|index| index as u32).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_numeric_ranges() {
        let column = numeric_column(vec![1.0, 2.0, 3.0, 4.0], None);
        let rows = filter_numeric_rows(
            &column,
            &VizTableNumericFilter {
                column_index: 0,
                operator: VizTableNumericFilterOperator::Between,
                value: Some(2.0),
                max_value: Some(3.0),
            },
        );

        assert_eq!(rows, vec![1, 2]);
    }

    #[test]
    fn handles_numeric_nulls() {
        let column = numeric_column(vec![1.0, 99.0, 3.0], Some(vec![1, 0, 1]));
        let null_rows = filter_numeric_rows(
            &column,
            &VizTableNumericFilter {
                column_index: 0,
                operator: VizTableNumericFilterOperator::IsNull,
                value: None,
                max_value: None,
            },
        );
        let non_null_rows = filter_numeric_rows(
            &column,
            &VizTableNumericFilter {
                column_index: 0,
                operator: VizTableNumericFilterOperator::IsNotNull,
                value: None,
                max_value: None,
            },
        );

        assert_eq!(null_rows, vec![1]);
        assert_eq!(non_null_rows, vec![0, 2]);
    }

    #[test]
    fn filters_boolean_values() {
        let column = VizTableBooleanColumn {
            values: vec![1, 0, 1, 1],
            validity: Some(vec![1, 1, 0, 1]),
        };

        assert_eq!(
            filter_boolean_rows(&column, VizTableNumericFilterOperator::Equals, Some(true)),
            vec![0, 3]
        );
        assert_eq!(
            filter_boolean_rows(&column, VizTableNumericFilterOperator::IsNull, None),
            vec![2]
        );
    }

    #[test]
    fn sorts_numeric_stably() {
        let column = numeric_column(vec![2.0, 1.0, 2.0, 3.0], None);
        let rows = sort_numeric_rows(
            &column,
            &[0, 1, 2, 3],
            VizTableSort {
                column_index: 0,
                direction: VizTableSortDirection::Asc,
                nulls: VizTableNulls::Last,
            },
        );

        assert_eq!(rows, vec![1, 0, 2, 3]);
    }

    #[test]
    fn sorts_boolean_stably() {
        let column = VizTableBooleanColumn {
            values: vec![1, 0, 0, 1],
            validity: None,
        };
        let rows = sort_boolean_rows(
            &column,
            &[0, 1, 2, 3],
            VizTableSort {
                column_index: 0,
                direction: VizTableSortDirection::Asc,
                nulls: VizTableNulls::Last,
            },
        );

        assert_eq!(rows, vec![1, 2, 0, 3]);
    }

    #[test]
    fn windows_after_filter_and_sort() {
        let columns = vec![numeric_column(vec![10.0, 30.0, 20.0, 40.0], None)];
        let result = query_numeric_table(
            &columns,
            &VizTableQuery {
                filters: vec![VizTableNumericFilter {
                    column_index: 0,
                    operator: VizTableNumericFilterOperator::Gte,
                    value: Some(20.0),
                    max_value: None,
                }],
                row_limit: Some(2),
                row_offset: 1,
                sort: Some(VizTableSort {
                    column_index: 0,
                    direction: VizTableSortDirection::Desc,
                    nulls: VizTableNulls::Last,
                }),
            },
        );

        assert_eq!(result.filtered_row_count, 3);
        assert_eq!(result.row_indices, vec![1, 2]);
    }

    #[test]
    fn returns_empty_results() {
        let columns = vec![numeric_column(vec![1.0, 2.0], None)];
        let result = query_numeric_table(
            &columns,
            &VizTableQuery {
                filters: vec![VizTableNumericFilter {
                    column_index: 0,
                    operator: VizTableNumericFilterOperator::Gt,
                    value: Some(10.0),
                    max_value: None,
                }],
                row_limit: Some(100),
                row_offset: 0,
                sort: None,
            },
        );

        assert_eq!(result.filtered_row_count, 0);
        assert!(result.row_indices.is_empty());
    }

    #[test]
    fn supports_zero_row_limit() {
        assert_eq!(window_rows(&[0, 1, 2], 0, Some(0)), Vec::<u32>::new());
    }

    fn numeric_column(values: Vec<f64>, validity: Option<Vec<u8>>) -> VizTableNumericColumn {
        VizTableNumericColumn {
            column_type: VizTableColumnType::Number,
            values,
            validity,
        }
    }
}
