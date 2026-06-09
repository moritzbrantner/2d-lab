use js_sys::{Object, Reflect, Uint32Array, Uint8Array};
use viz_engine_core::table::{
    query_ascii_string_filter_window, query_ascii_string_search, query_boolean_filter_window,
    query_numeric_table, sort_boolean_rows_window, sort_numeric_rows_window, VizTableBooleanColumn,
    VizTableColumnType, VizTableIndexResult, VizTableNulls, VizTableNumericColumn,
    VizTableNumericFilterOperator, VizTableQuery, VizTableSort, VizTableSortDirection,
    VizTableStringColumn, VizTableStringFilter, VizTableStringFilterOperator,
    VizTableStringSearchQuery,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct VizEngineWasmTableIndex {
    boolean_columns: Vec<VizTableBooleanColumn>,
    numeric_columns: Vec<VizTableNumericColumn>,
    string_columns: Vec<VizTableStringColumn>,
}

#[wasm_bindgen]
impl VizEngineWasmTableIndex {
    #[wasm_bindgen(constructor)]
    pub fn new() -> VizEngineWasmTableIndex {
        Self {
            boolean_columns: Vec::new(),
            numeric_columns: Vec::new(),
            string_columns: Vec::new(),
        }
    }

    #[wasm_bindgen(js_name = addNumericColumn)]
    pub fn add_numeric_column(
        &mut self,
        column_type: String,
        values: js_sys::Float64Array,
        validity: Option<Uint8Array>,
    ) -> Result<usize, JsValue> {
        let column_index = self.numeric_columns.len();
        self.numeric_columns.push(VizTableNumericColumn {
            column_type: parse_column_type(&column_type)?,
            values: values.to_vec(),
            validity: validity.map(|values| values.to_vec()),
        });

        Ok(column_index)
    }

    #[wasm_bindgen(js_name = addBooleanColumn)]
    pub fn add_boolean_column(
        &mut self,
        values: Uint8Array,
        validity: Option<Uint8Array>,
    ) -> usize {
        let column_index = self.boolean_columns.len();
        self.boolean_columns.push(VizTableBooleanColumn {
            values: values.to_vec(),
            validity: validity.map(|values| values.to_vec()),
        });

        column_index
    }

    #[wasm_bindgen(js_name = addAsciiStringColumn)]
    pub fn add_ascii_string_column(
        &mut self,
        values: JsValue,
        validity: Option<Uint8Array>,
    ) -> Result<usize, JsValue> {
        let values: Vec<Option<String>> =
            serde_wasm_bindgen::from_value(values).map_err(into_js_error)?;
        let mut resolved_validity = validity
            .map(|values| values.to_vec())
            .unwrap_or_else(|| vec![1; values.len()]);
        if resolved_validity.len() < values.len() {
            resolved_validity.resize(values.len(), 1);
        }

        let values = values
            .into_iter()
            .enumerate()
            .map(|(index, value)| match value {
                Some(value) => value,
                None => {
                    resolved_validity[index] = 0;
                    String::new()
                }
            })
            .collect();
        let column_index = self.string_columns.len();
        self.string_columns.push(VizTableStringColumn::from_values(
            values,
            Some(resolved_validity),
        ));

        Ok(column_index)
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
        row_index_result_object(query_boolean_filter_window(
            column,
            parse_filter_operator(&operator)?,
            value,
            row_offset,
            row_limit,
        ))
    }

    #[wasm_bindgen(js_name = queryNumeric)]
    pub fn query_numeric(&self, query: JsValue) -> Result<JsValue, JsValue> {
        let query: VizTableQuery = serde_wasm_bindgen::from_value(query).map_err(into_js_error)?;
        row_index_result_object(query_numeric_table(&self.numeric_columns, &query))
    }

    #[wasm_bindgen(js_name = queryStringFilter)]
    pub fn query_string_filter(
        &self,
        column_index: usize,
        operator: String,
        value: Option<String>,
        case_sensitive: bool,
        row_offset: usize,
        row_limit: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        let column = self
            .string_columns
            .get(column_index)
            .ok_or_else(|| js_error(format!("unknown string table column {column_index}")))?;
        row_index_result_object(query_ascii_string_filter_window(
            column,
            &VizTableStringFilter {
                column_index,
                operator: parse_string_filter_operator(&operator)?,
                value,
                case_sensitive,
            },
            row_offset,
            row_limit,
        ))
    }

    #[wasm_bindgen(js_name = queryStringSearch)]
    pub fn query_string_search(
        &self,
        column_indices: JsValue,
        query: String,
        case_sensitive: bool,
        row_offset: usize,
        row_limit: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        let column_indices: Vec<usize> =
            serde_wasm_bindgen::from_value(column_indices).map_err(into_js_error)?;
        row_index_result_object(query_ascii_string_search(
            &self.string_columns,
            &VizTableStringSearchQuery {
                column_indices,
                query,
                case_sensitive,
                row_limit,
                row_offset,
            },
        ))
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
        let row_indices = sort_numeric_rows_window(
            column,
            &rows,
            VizTableSort {
                column_index,
                direction: parse_sort_direction(&direction)?,
                nulls: parse_nulls(&nulls)?,
            },
            row_offset,
            row_limit,
        );

        row_index_result_object(VizTableIndexResult {
            filtered_row_count: rows.len(),
            row_indices,
        })
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
        let row_indices = sort_boolean_rows_window(
            column,
            &rows,
            VizTableSort {
                column_index,
                direction: parse_sort_direction(&direction)?,
                nulls: parse_nulls(&nulls)?,
            },
            row_offset,
            row_limit,
        );

        row_index_result_object(VizTableIndexResult {
            filtered_row_count: rows.len(),
            row_indices,
        })
    }
}

fn row_index_result_object(result: VizTableIndexResult) -> Result<JsValue, JsValue> {
    let object = Object::new();
    let source_index = Uint32Array::from(result.row_indices.as_slice());
    Reflect::set(&object, &"sourceIndex".into(), &source_index.into())?;
    Reflect::set(
        &object,
        &"filteredRowCount".into(),
        &JsValue::from_f64(result.filtered_row_count as f64),
    )?;

    Ok(object.into())
}

fn parse_column_type(value: &str) -> Result<VizTableColumnType, JsValue> {
    match value {
        "date" => Ok(VizTableColumnType::Date),
        "number" | "" => Ok(VizTableColumnType::Number),
        column_type => Err(js_error(format!(
            "unsupported numeric table column type `{column_type}`"
        ))),
    }
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

fn parse_string_filter_operator(value: &str) -> Result<VizTableStringFilterOperator, JsValue> {
    match value {
        "contains" => Ok(VizTableStringFilterOperator::Contains),
        "endsWith" => Ok(VizTableStringFilterOperator::EndsWith),
        "equals" => Ok(VizTableStringFilterOperator::Equals),
        "isNull" => Ok(VizTableStringFilterOperator::IsNull),
        "isNotNull" => Ok(VizTableStringFilterOperator::IsNotNull),
        "notEquals" => Ok(VizTableStringFilterOperator::NotEquals),
        "startsWith" => Ok(VizTableStringFilterOperator::StartsWith),
        operator => Err(js_error(format!(
            "unsupported table string filter operator `{operator}`"
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

fn into_js_error(error: impl std::fmt::Display) -> JsValue {
    js_error(error.to_string())
}

fn js_error(message: String) -> JsValue {
    js_sys::Error::new(&message).into()
}
