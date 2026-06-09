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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VizTableStringFilterOperator {
    Contains,
    EndsWith,
    Equals,
    IsNull,
    IsNotNull,
    NotEquals,
    StartsWith,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableStringFilter {
    pub column_index: usize,
    pub operator: VizTableStringFilterOperator,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub case_sensitive: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableStringSearchQuery {
    pub column_indices: Vec<usize>,
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub row_limit: Option<usize>,
    #[serde(default)]
    pub row_offset: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VizTableStringColumn {
    pub values: Vec<String>,
    pub normalized_values: Vec<String>,
    #[serde(default)]
    pub validity: Option<Vec<u8>>,
    pub ascii_only: bool,
}

impl VizTableStringColumn {
    pub fn from_values(values: Vec<String>, validity: Option<Vec<u8>>) -> Self {
        let ascii_only = values.iter().all(|value| value.is_ascii());
        let normalized_values = values
            .iter()
            .map(|value| value.to_ascii_lowercase())
            .collect();

        Self {
            values,
            normalized_values,
            validity,
            ascii_only,
        }
    }
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

pub fn query_numeric_filter_window(
    column: &VizTableNumericColumn,
    filter: &VizTableNumericFilter,
    row_offset: usize,
    row_limit: Option<usize>,
) -> VizTableIndexResult {
    let limit = normalized_row_limit(row_limit);
    let mut filtered_row_count = 0;
    let mut row_indices = Vec::with_capacity(limit.min(column.values.len()));

    for row_index in 0..column.values.len() {
        if !numeric_row_matches(column, row_index, filter) {
            continue;
        }

        if limit > 0 && filtered_row_count >= row_offset && row_indices.len() < limit {
            row_indices.push(row_index as u32);
        }
        filtered_row_count += 1;
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices,
    }
}

pub fn query_boolean_filter_window(
    column: &VizTableBooleanColumn,
    operator: VizTableNumericFilterOperator,
    value: Option<bool>,
    row_offset: usize,
    row_limit: Option<usize>,
) -> VizTableIndexResult {
    let limit = normalized_row_limit(row_limit);
    let mut filtered_row_count = 0;
    let mut row_indices = Vec::with_capacity(limit.min(column.values.len()));

    for row_index in 0..column.values.len() {
        if !boolean_row_matches(column, row_index, operator, value) {
            continue;
        }

        if limit > 0 && filtered_row_count >= row_offset && row_indices.len() < limit {
            row_indices.push(row_index as u32);
        }
        filtered_row_count += 1;
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices,
    }
}

pub fn sort_numeric_rows(
    column: &VizTableNumericColumn,
    rows: &[u32],
    sort: VizTableSort,
) -> Vec<u32> {
    let mut output = rows.to_vec();
    output.sort_by(|left, right| compare_numeric_rows(column, *left, *right, sort));
    output
}

pub fn sort_numeric_rows_window(
    column: &VizTableNumericColumn,
    rows: &[u32],
    sort: VizTableSort,
    row_offset: usize,
    row_limit: Option<usize>,
) -> Vec<u32> {
    let limit = normalized_row_limit(row_limit);
    if limit == 0 || row_offset >= rows.len() {
        return Vec::new();
    }

    let take_count = row_offset.saturating_add(limit).min(rows.len());
    let mut output = rows.to_vec();
    if take_count >= output.len() {
        output.sort_by(|left, right| compare_numeric_rows(column, *left, *right, sort));
        return output[row_offset..take_count].to_vec();
    }

    output.select_nth_unstable_by(take_count - 1, |left, right| {
        compare_numeric_rows(column, *left, *right, sort)
    });
    output[..take_count].sort_by(|left, right| compare_numeric_rows(column, *left, *right, sort));
    output[row_offset..take_count].to_vec()
}

pub fn sort_boolean_rows(
    column: &VizTableBooleanColumn,
    rows: &[u32],
    sort: VizTableSort,
) -> Vec<u32> {
    sort_boolean_rows_window(column, rows, sort, 0, Some(rows.len()))
}

pub fn sort_boolean_rows_window(
    column: &VizTableBooleanColumn,
    rows: &[u32],
    sort: VizTableSort,
    row_offset: usize,
    row_limit: Option<usize>,
) -> Vec<u32> {
    let limit = normalized_row_limit(row_limit);
    if limit == 0 || row_offset >= rows.len() {
        return Vec::new();
    }

    let mut nulls = Vec::new();
    let mut falses = Vec::new();
    let mut trues = Vec::new();
    for row in rows {
        match boolean_value(column, *row as usize) {
            None => nulls.push(*row),
            Some(false) => falses.push(*row),
            Some(true) => trues.push(*row),
        }
    }

    let mut ordered = Vec::with_capacity(rows.len());
    match sort.nulls {
        VizTableNulls::First => {
            ordered.extend(nulls);
            append_boolean_buckets(&mut ordered, falses, trues, sort.direction);
        }
        VizTableNulls::Last => {
            append_boolean_buckets(&mut ordered, falses, trues, sort.direction);
            ordered.extend(nulls);
        }
    }

    window_rows(&ordered, row_offset, row_limit)
}

fn append_boolean_buckets(
    output: &mut Vec<u32>,
    falses: Vec<u32>,
    trues: Vec<u32>,
    direction: VizTableSortDirection,
) {
    match direction {
        VizTableSortDirection::Asc => {
            output.extend(falses);
            output.extend(trues);
        }
        VizTableSortDirection::Desc => {
            output.extend(trues);
            output.extend(falses);
        }
    }
}

pub fn window_rows(rows: &[u32], row_offset: usize, row_limit: Option<usize>) -> Vec<u32> {
    let limit = normalized_row_limit(row_limit);
    if limit == 0 || row_offset >= rows.len() {
        return Vec::new();
    }

    rows.iter().skip(row_offset).take(limit).copied().collect()
}

pub fn query_numeric_table(
    columns: &[VizTableNumericColumn],
    query: &VizTableQuery,
) -> VizTableIndexResult {
    let row_count = numeric_row_count(columns);

    if query.sort.is_none() {
        return query_numeric_filters_window(
            columns,
            &query.filters,
            query.row_offset,
            query.row_limit,
        );
    }

    let mut rows = Vec::with_capacity(row_count);
    for row_index in 0..row_count {
        if row_matches_numeric_filters(columns, &query.filters, row_index) {
            rows.push(row_index as u32);
        }
    }

    let filtered_row_count = rows.len();
    if let Some(sort) = query.sort {
        if let Some(column) = columns.get(sort.column_index) {
            rows = sort_numeric_rows_window(column, &rows, sort, query.row_offset, query.row_limit);
        } else {
            rows = window_rows(&rows, query.row_offset, query.row_limit);
        }
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices: rows,
    }
}

pub fn query_numeric_filters_window(
    columns: &[VizTableNumericColumn],
    filters: &[VizTableNumericFilter],
    row_offset: usize,
    row_limit: Option<usize>,
) -> VizTableIndexResult {
    if filters.len() == 1 {
        let filter = &filters[0];
        let Some(column) = columns.get(filter.column_index) else {
            return empty_index_result();
        };
        return query_numeric_filter_window(column, filter, row_offset, row_limit);
    }

    let row_count = numeric_row_count(columns);
    let limit = normalized_row_limit(row_limit);
    let mut filtered_row_count = 0;
    let mut row_indices = Vec::with_capacity(limit.min(row_count));

    for row_index in 0..row_count {
        if !row_matches_numeric_filters(columns, filters, row_index) {
            continue;
        }

        if limit > 0 && filtered_row_count >= row_offset && row_indices.len() < limit {
            row_indices.push(row_index as u32);
        }
        filtered_row_count += 1;
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices,
    }
}

pub fn row_matches_numeric_filters(
    columns: &[VizTableNumericColumn],
    filters: &[VizTableNumericFilter],
    row_index: usize,
) -> bool {
    filters.iter().all(|filter| {
        columns.get(filter.column_index).map_or(false, |column| {
            numeric_row_matches(column, row_index, filter)
        })
    })
}

pub fn query_ascii_string_filter_window(
    column: &VizTableStringColumn,
    filter: &VizTableStringFilter,
    row_offset: usize,
    row_limit: Option<usize>,
) -> VizTableIndexResult {
    if !column.ascii_only
        || filter
            .value
            .as_deref()
            .map_or(false, |value| !value.is_ascii())
    {
        return empty_index_result();
    }

    let limit = normalized_row_limit(row_limit);
    let mut filtered_row_count = 0;
    let mut row_indices = Vec::with_capacity(limit.min(column.values.len()));

    for row_index in 0..column.values.len() {
        if !string_row_matches(column, row_index, filter) {
            continue;
        }

        if limit > 0 && filtered_row_count >= row_offset && row_indices.len() < limit {
            row_indices.push(row_index as u32);
        }
        filtered_row_count += 1;
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices,
    }
}

pub fn query_ascii_string_search(
    columns: &[VizTableStringColumn],
    query: &VizTableStringSearchQuery,
) -> VizTableIndexResult {
    if !query.query.is_ascii() {
        return empty_index_result();
    }

    let selected_columns = query
        .column_indices
        .iter()
        .filter_map(|column_index| columns.get(*column_index))
        .collect::<Vec<_>>();
    if selected_columns.is_empty() || selected_columns.iter().any(|column| !column.ascii_only) {
        return empty_index_result();
    }

    let row_count = selected_columns
        .iter()
        .map(|column| column.values.len())
        .max()
        .unwrap_or(0);
    let needle = if query.case_sensitive {
        query.query.clone()
    } else {
        query.query.to_ascii_lowercase()
    };
    let limit = normalized_row_limit(query.row_limit);
    let mut filtered_row_count = 0;
    let mut row_indices = Vec::with_capacity(limit.min(row_count));

    for row_index in 0..row_count {
        if !selected_columns.iter().any(|column| {
            string_value(column, row_index, query.case_sensitive)
                .map_or(false, |value| value.contains(&needle))
        }) {
            continue;
        }

        if limit > 0 && filtered_row_count >= query.row_offset && row_indices.len() < limit {
            row_indices.push(row_index as u32);
        }
        filtered_row_count += 1;
    }

    VizTableIndexResult {
        filtered_row_count,
        row_indices,
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
        .filter(|row| boolean_row_matches(column, *row as usize, operator, value))
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

fn boolean_row_matches(
    column: &VizTableBooleanColumn,
    row_index: usize,
    operator: VizTableNumericFilterOperator,
    value: Option<bool>,
) -> bool {
    let actual = boolean_value(column, row_index);
    match operator {
        VizTableNumericFilterOperator::Equals => actual == value,
        VizTableNumericFilterOperator::NotEquals => actual != value,
        VizTableNumericFilterOperator::IsNull => actual.is_none(),
        VizTableNumericFilterOperator::IsNotNull => actual.is_some(),
        _ => false,
    }
}

fn string_row_matches(
    column: &VizTableStringColumn,
    row_index: usize,
    filter: &VizTableStringFilter,
) -> bool {
    let actual = string_value(column, row_index, filter.case_sensitive);
    match filter.operator {
        VizTableStringFilterOperator::IsNull => actual.is_none(),
        VizTableStringFilterOperator::IsNotNull => actual.is_some(),
        VizTableStringFilterOperator::Contains => {
            let Some(value) = normalize_string_filter_value(filter) else {
                return false;
            };
            actual.map_or(false, |actual| actual.contains(&value))
        }
        VizTableStringFilterOperator::StartsWith => {
            let Some(value) = normalize_string_filter_value(filter) else {
                return false;
            };
            actual.map_or(false, |actual| actual.starts_with(&value))
        }
        VizTableStringFilterOperator::EndsWith => {
            let Some(value) = normalize_string_filter_value(filter) else {
                return false;
            };
            actual.map_or(false, |actual| actual.ends_with(&value))
        }
        VizTableStringFilterOperator::Equals => {
            let Some(value) = normalize_string_filter_value(filter) else {
                return false;
            };
            actual.map_or(false, |actual| actual == value)
        }
        VizTableStringFilterOperator::NotEquals => {
            let Some(value) = normalize_string_filter_value(filter) else {
                return false;
            };
            actual.map_or(true, |actual| actual != value)
        }
    }
}

fn normalize_string_filter_value(filter: &VizTableStringFilter) -> Option<String> {
    let value = filter.value.as_ref()?;
    if filter.case_sensitive {
        Some(value.clone())
    } else {
        Some(value.to_ascii_lowercase())
    }
}

fn string_value(
    column: &VizTableStringColumn,
    row_index: usize,
    case_sensitive: bool,
) -> Option<&str> {
    if !is_valid(column.validity.as_deref(), row_index) {
        return None;
    }
    let value = if case_sensitive {
        column.values.get(row_index)
    } else {
        column.normalized_values.get(row_index)
    }?;
    Some(value.as_str())
}

fn compare_numeric_rows(
    column: &VizTableNumericColumn,
    left: u32,
    right: u32,
    sort: VizTableSort,
) -> Ordering {
    compare_optional_numeric(
        numeric_value(column, left as usize),
        numeric_value(column, right as usize),
        sort.direction,
        sort.nulls,
    )
    .then(left.cmp(&right))
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

fn normalized_row_limit(row_limit: Option<usize>) -> usize {
    row_limit.unwrap_or(100)
}

fn numeric_row_count(columns: &[VizTableNumericColumn]) -> usize {
    columns
        .iter()
        .map(|column| column.values.len())
        .max()
        .unwrap_or(0)
}

fn all_rows(row_count: usize) -> Vec<u32> {
    (0..row_count).map(|index| index as u32).collect()
}

fn empty_index_result() -> VizTableIndexResult {
    VizTableIndexResult {
        filtered_row_count: 0,
        row_indices: Vec::new(),
    }
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

    #[test]
    fn streaming_numeric_filter_matches_full_filter_window() {
        let column = numeric_column(vec![1.0, 2.0, 3.0, 4.0, 5.0], None);
        let filter = VizTableNumericFilter {
            column_index: 0,
            operator: VizTableNumericFilterOperator::Gte,
            value: Some(2.0),
            max_value: None,
        };
        let full = filter_numeric_rows(&column, &filter);
        let streamed = query_numeric_filter_window(&column, &filter, 1, Some(2));

        assert_eq!(streamed.filtered_row_count, full.len());
        assert_eq!(streamed.row_indices, window_rows(&full, 1, Some(2)));
    }

    #[test]
    fn streaming_boolean_filter_matches_full_filter_window() {
        let column = VizTableBooleanColumn {
            values: vec![1, 0, 1, 1, 0],
            validity: Some(vec![1, 1, 0, 1, 1]),
        };
        let full = filter_boolean_rows(&column, VizTableNumericFilterOperator::Equals, Some(true));
        let streamed = query_boolean_filter_window(
            &column,
            VizTableNumericFilterOperator::Equals,
            Some(true),
            1,
            Some(1),
        );

        assert_eq!(streamed.filtered_row_count, full.len());
        assert_eq!(streamed.row_indices, window_rows(&full, 1, Some(1)));
    }

    #[test]
    fn streaming_filters_preserve_zero_limit_and_large_offset() {
        let column = numeric_column(vec![1.0, 2.0, 3.0], None);
        let filter = VizTableNumericFilter {
            column_index: 0,
            operator: VizTableNumericFilterOperator::IsNotNull,
            value: None,
            max_value: None,
        };

        assert_eq!(
            query_numeric_filter_window(&column, &filter, 0, Some(0)),
            VizTableIndexResult {
                filtered_row_count: 3,
                row_indices: vec![],
            }
        );
        assert_eq!(
            query_numeric_filter_window(&column, &filter, 99, Some(10)),
            VizTableIndexResult {
                filtered_row_count: 3,
                row_indices: vec![],
            }
        );
    }

    #[test]
    fn top_k_numeric_sort_matches_full_sort_window() {
        let column = numeric_column(
            vec![4.0, 1.0, 3.0, 2.0, 5.0, 0.0],
            Some(vec![1, 1, 0, 1, 1, 1]),
        );
        let rows = vec![0, 1, 2, 3, 4, 5];

        for direction in [VizTableSortDirection::Asc, VizTableSortDirection::Desc] {
            for nulls in [VizTableNulls::First, VizTableNulls::Last] {
                let sort = VizTableSort {
                    column_index: 0,
                    direction,
                    nulls,
                };
                let full = sort_numeric_rows(&column, &rows, sort);
                assert_eq!(
                    sort_numeric_rows_window(&column, &rows, sort, 1, Some(3)),
                    window_rows(&full, 1, Some(3))
                );
            }
        }
    }

    #[test]
    fn boolean_bucket_sort_preserves_order_and_windows() {
        let column = VizTableBooleanColumn {
            values: vec![1, 0, 1, 0, 1],
            validity: Some(vec![1, 1, 0, 1, 1]),
        };
        let rows = vec![0, 1, 2, 3, 4];

        assert_eq!(
            sort_boolean_rows_window(
                &column,
                &rows,
                VizTableSort {
                    column_index: 0,
                    direction: VizTableSortDirection::Asc,
                    nulls: VizTableNulls::Last,
                },
                0,
                Some(10),
            ),
            vec![1, 3, 0, 4, 2]
        );
        assert_eq!(
            sort_boolean_rows_window(
                &column,
                &rows,
                VizTableSort {
                    column_index: 0,
                    direction: VizTableSortDirection::Desc,
                    nulls: VizTableNulls::First,
                },
                1,
                Some(2),
            ),
            vec![0, 4]
        );
    }

    #[test]
    fn combined_numeric_filters_scan_once_and_window() {
        let columns = vec![
            numeric_column(vec![10.0, 20.0, 30.0, 40.0], None),
            numeric_column(vec![4.0, 3.0, 2.0, 1.0], None),
        ];
        let filters = vec![
            VizTableNumericFilter {
                column_index: 0,
                operator: VizTableNumericFilterOperator::Gte,
                value: Some(20.0),
                max_value: None,
            },
            VizTableNumericFilter {
                column_index: 1,
                operator: VizTableNumericFilterOperator::Lte,
                value: Some(2.0),
                max_value: None,
            },
        ];

        assert_eq!(
            query_numeric_filters_window(&columns, &filters, 0, Some(10)),
            VizTableIndexResult {
                filtered_row_count: 2,
                row_indices: vec![2, 3],
            }
        );
    }

    #[test]
    fn ascii_string_filters_match_expected_rows() {
        let column = string_column(vec!["Ada Core", "grace edge", "", "Core tail"], None);

        assert_eq!(
            query_ascii_string_filter_window(
                &column,
                &VizTableStringFilter {
                    case_sensitive: false,
                    column_index: 0,
                    operator: VizTableStringFilterOperator::Contains,
                    value: Some("core".to_string()),
                },
                0,
                Some(10),
            )
            .row_indices,
            vec![0, 3]
        );
        assert_eq!(
            query_ascii_string_filter_window(
                &column,
                &VizTableStringFilter {
                    case_sensitive: true,
                    column_index: 0,
                    operator: VizTableStringFilterOperator::StartsWith,
                    value: Some("Ada".to_string()),
                },
                0,
                Some(10),
            )
            .row_indices,
            vec![0]
        );
        assert_eq!(
            query_ascii_string_filter_window(
                &column,
                &VizTableStringFilter {
                    case_sensitive: false,
                    column_index: 0,
                    operator: VizTableStringFilterOperator::EndsWith,
                    value: Some("TAIL".to_string()),
                },
                0,
                Some(10),
            )
            .row_indices,
            vec![3]
        );
    }

    #[test]
    fn ascii_string_search_handles_nulls_and_windows() {
        let columns = vec![
            string_column(
                vec!["Ada core", "Grace edge", "Radia core", "Mary"],
                Some(vec![1, 1, 0, 1]),
            ),
            string_column(vec!["na", "eu-core", "apac", "core"], None),
        ];
        let result = query_ascii_string_search(
            &columns,
            &VizTableStringSearchQuery {
                case_sensitive: false,
                column_indices: vec![0, 1],
                query: "core".to_string(),
                row_limit: Some(2),
                row_offset: 1,
            },
        );

        assert_eq!(result.filtered_row_count, 3);
        assert_eq!(result.row_indices, vec![1, 3]);
    }

    fn numeric_column(values: Vec<f64>, validity: Option<Vec<u8>>) -> VizTableNumericColumn {
        VizTableNumericColumn {
            column_type: VizTableColumnType::Number,
            values,
            validity,
        }
    }

    fn string_column(values: Vec<&str>, validity: Option<Vec<u8>>) -> VizTableStringColumn {
        VizTableStringColumn::from_values(
            values.into_iter().map(|value| value.to_string()).collect(),
            validity,
        )
    }
}
