use js_sys::{Float64Array, Object, Reflect, Uint32Array, Uint8Array};
use serde::Deserialize;
use viz_engine_core::table::{
    filter_boolean_rows, filter_numeric_rows, query_numeric_table, sort_boolean_rows,
    sort_numeric_rows, VizTableBooleanColumn, VizTableColumnType, VizTableIndexResult,
    VizTableNulls, VizTableNumericColumn, VizTableNumericFilter, VizTableNumericFilterOperator,
    VizTableQuery, VizTableSort, VizTableSortDirection,
};
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmTableIndexInit {
    #[serde(default)]
    numeric_columns: Vec<WasmNumericColumn>,
    #[serde(default)]
    boolean_columns: Vec<WasmBooleanColumn>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmNumericColumn {
    #[serde(default = "default_numeric_column_type")]
    column_type: VizTableColumnType,
    values: Vec<f64>,
    #[serde(default)]
    validity: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmBooleanColumn {
    values: Vec<u8>,
    #[serde(default)]
    validity: Option<Vec<u8>>,
}

#[wasm_bindgen]
pub struct VizEngineWasmTableIndex {
    boolean_columns: Vec<VizTableBooleanColumn>,
    numeric_columns: Vec<VizTableNumericColumn>,
}

#[wasm_bindgen]
impl VizEngineWasmTableIndex {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<VizEngineWasmTableIndex, JsValue> {
        let input: WasmTableIndexInit =
            serde_wasm_bindgen::from_value(input).map_err(into_js_error)?;
        Ok(Self {
            boolean_columns: input
                .boolean_columns
                .into_iter()
                .map(|column| VizTableBooleanColumn {
                    values: column.values,
                    validity: column.validity,
                })
                .collect(),
            numeric_columns: input
                .numeric_columns
                .into_iter()
                .map(|column| VizTableNumericColumn {
                    column_type: column.column_type,
                    values: column.values,
                    validity: column.validity,
                })
                .collect(),
        })
    }

    #[wasm_bindgen(js_name = filterNumeric)]
    pub fn filter_numeric(
        &self,
        column_index: usize,
        operator: String,
        value: f64,
        max_value: f64,
    ) -> Result<JsValue, JsValue> {
        let column = self
            .numeric_columns
            .get(column_index)
            .ok_or_else(|| js_error(format!("unknown numeric table column {column_index}")))?;
        let filter = VizTableNumericFilter {
            column_index,
            operator: parse_filter_operator(&operator)?,
            value: value.is_finite().then_some(value),
            max_value: max_value.is_finite().then_some(max_value),
        };
        let row_indices = filter_numeric_rows(column, &filter);

        result_object(
            VizTableIndexResult {
                filtered_row_count: row_indices.len(),
                row_indices,
            },
            Some(column),
            None,
        )
    }

    #[wasm_bindgen(js_name = queryBoolean)]
    pub fn query_boolean(
        &self,
        column_index: usize,
        operator: String,
        value: Option<bool>,
        row_offset: usize,
        row_limit: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        let column = self
            .boolean_columns
            .get(column_index)
            .ok_or_else(|| js_error(format!("unknown boolean table column {column_index}")))?;
        let filtered = filter_boolean_rows(column, parse_filter_operator(&operator)?, value);
        let windowed = viz_engine_core::table::window_rows(&filtered, row_offset, row_limit);

        result_object(
            VizTableIndexResult {
                filtered_row_count: filtered.len(),
                row_indices: windowed,
            },
            None,
            Some(column),
        )
    }

    #[wasm_bindgen(js_name = queryNumeric)]
    pub fn query_numeric(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizTableQuery = serde_wasm_bindgen::from_value(query).map_err(into_js_error)?;
        let result = query_numeric_table(&self.numeric_columns, &query);
        let projected_column = query
            .sort
            .and_then(|sort| self.numeric_columns.get(sort.column_index))
            .or_else(|| {
                query
                    .filters
                    .first()
                    .and_then(|filter| self.numeric_columns.get(filter.column_index))
            });

        result_object(result, projected_column, None)
    }

    #[wasm_bindgen(js_name = sortNumeric)]
    pub fn sort_numeric(
        &self,
        column_index: usize,
        direction: String,
        nulls: String,
        row_offset: usize,
        row_limit: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        let column = self
            .numeric_columns
            .get(column_index)
            .ok_or_else(|| js_error(format!("unknown numeric table column {column_index}")))?;
        let rows = (0..column.values.len())
            .map(|index| index as u32)
            .collect::<Vec<_>>();
        let sorted = sort_numeric_rows(
            column,
            &rows,
            VizTableSort {
                column_index,
                direction: parse_sort_direction(&direction)?,
                nulls: parse_nulls(&nulls)?,
            },
        );
        let row_indices = viz_engine_core::table::window_rows(&sorted, row_offset, row_limit);

        result_object(
            VizTableIndexResult {
                filtered_row_count: sorted.len(),
                row_indices,
            },
            Some(column),
            None,
        )
    }

    #[wasm_bindgen(js_name = sortBoolean)]
    pub fn sort_boolean(
        &self,
        column_index: usize,
        direction: String,
        nulls: String,
        row_offset: usize,
        row_limit: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        let column = self
            .boolean_columns
            .get(column_index)
            .ok_or_else(|| js_error(format!("unknown boolean table column {column_index}")))?;
        let rows = (0..column.values.len())
            .map(|index| index as u32)
            .collect::<Vec<_>>();
        let sorted = sort_boolean_rows(
            column,
            &rows,
            VizTableSort {
                column_index,
                direction: parse_sort_direction(&direction)?,
                nulls: parse_nulls(&nulls)?,
            },
        );
        let row_indices = viz_engine_core::table::window_rows(&sorted, row_offset, row_limit);

        result_object(
            VizTableIndexResult {
                filtered_row_count: sorted.len(),
                row_indices,
            },
            None,
            Some(column),
        )
    }
}

fn result_object(
    result: VizTableIndexResult,
    numeric_column: Option<&VizTableNumericColumn>,
    boolean_column: Option<&VizTableBooleanColumn>,
) -> Result<JsValue, JsValue> {
    let object = Object::new();
    let source_index = Uint32Array::from(result.row_indices.as_slice());
    Reflect::set(&object, &"sourceIndex".into(), &source_index.into())?;
    Reflect::set(
        &object,
        &"filteredRowCount".into(),
        &JsValue::from_f64(result.filtered_row_count as f64),
    )?;

    if let Some(column) = numeric_column {
        let values = result
            .row_indices
            .iter()
            .map(|index| {
                column
                    .values
                    .get(*index as usize)
                    .copied()
                    .unwrap_or(f64::NAN)
            })
            .collect::<Vec<_>>();
        let validity = result
            .row_indices
            .iter()
            .map(|index| validity_at(column.validity.as_deref(), *index as usize))
            .collect::<Vec<_>>();
        Reflect::set(
            &object,
            &"values".into(),
            &Float64Array::from(values.as_slice()).into(),
        )?;
        Reflect::set(
            &object,
            &"validity".into(),
            &Uint8Array::from(validity.as_slice()).into(),
        )?;
    }

    if let Some(column) = boolean_column {
        let values = result
            .row_indices
            .iter()
            .map(|index| column.values.get(*index as usize).copied().unwrap_or(0))
            .collect::<Vec<_>>();
        let validity = result
            .row_indices
            .iter()
            .map(|index| validity_at(column.validity.as_deref(), *index as usize))
            .collect::<Vec<_>>();
        Reflect::set(
            &object,
            &"values".into(),
            &Uint8Array::from(values.as_slice()).into(),
        )?;
        Reflect::set(
            &object,
            &"validity".into(),
            &Uint8Array::from(validity.as_slice()).into(),
        )?;
    }

    Ok(object.into())
}

fn validity_at(validity: Option<&[u8]>, row_index: usize) -> u8 {
    validity
        .and_then(|values| values.get(row_index))
        .copied()
        .unwrap_or(1)
}

fn parse_filter_operator(value: &str) -> Result<VizTableNumericFilterOperator, JsValue> {
    match value {
        "equals" => Ok(VizTableNumericFilterOperator::Equals),
        "notEquals" => Ok(VizTableNumericFilterOperator::NotEquals),
        "gt" => Ok(VizTableNumericFilterOperator::Gt),
        "gte" => Ok(VizTableNumericFilterOperator::Gte),
        "lt" => Ok(VizTableNumericFilterOperator::Lt),
        "lte" => Ok(VizTableNumericFilterOperator::Lte),
        "between" => Ok(VizTableNumericFilterOperator::Between),
        "isNull" => Ok(VizTableNumericFilterOperator::IsNull),
        "isNotNull" => Ok(VizTableNumericFilterOperator::IsNotNull),
        operator => Err(js_error(format!(
            "unsupported table filter operator `{operator}`"
        ))),
    }
}

fn parse_sort_direction(value: &str) -> Result<VizTableSortDirection, JsValue> {
    match value {
        "asc" => Ok(VizTableSortDirection::Asc),
        "desc" => Ok(VizTableSortDirection::Desc),
        direction => Err(js_error(format!(
            "unsupported table sort direction `{direction}`"
        ))),
    }
}

fn parse_nulls(value: &str) -> Result<VizTableNulls, JsValue> {
    match value {
        "first" => Ok(VizTableNulls::First),
        "last" | "" => Ok(VizTableNulls::Last),
        nulls => Err(js_error(format!("unsupported table null order `{nulls}`"))),
    }
}

fn default_numeric_column_type() -> VizTableColumnType {
    VizTableColumnType::Number
}

fn into_js_error(error: impl std::fmt::Display) -> JsValue {
    js_error(error.to_string())
}

fn js_error(message: String) -> JsValue {
    js_sys::Error::new(&message).into()
}
