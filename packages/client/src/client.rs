use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, error, info, warn};

use crate::error::ApiError;
use crate::types::ConnectionConfig;

/// API リクエストペイロード（基本）
#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
struct ApiPayload {
    api_version: String,
    api_key: String,
}

/// データ付きペイロード（更新/作成/検索用）
#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
struct RecordPayload {
    api_version: String,
    api_key: String,
    #[serde(flatten)]
    data: Value,
}

/// API レスポンス
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ApiResponse {
    status_code: Option<u16>,
    message: Option<String>,
    id: Option<u64>,
    response: Option<ResponseData>,
}

/// API レスポンスの Response 部分
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ResponseData {
    data: Option<Value>,
}

/// Pleasanter API クライアント（async 版）
#[derive(Clone)]
pub struct PleasanterClient {
    client: Client,
    base_url: String,
    api_key: String,
    api_version: String,
}

impl PleasanterClient {
    /// 新しいクライアントを作成
    pub fn new(config: &ConnectionConfig) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: config.base_url.clone(),
            api_key: config.api_key.clone(),
            api_version: config.api_version.clone(),
        }
    }

    /// サイト情報を取得（Pull 用）
    pub async fn get_site(&self, site_id: u64) -> Result<Value, ApiError> {
        let url = format!("{}/api/items/{}/getsite", self.base_url, site_id);
        let payload = self.base_payload();
        self.post_request(&url, &payload, site_id).await
    }

    /// サイト設定を更新（Push 用）
    pub async fn update_site(&self, site_id: u64, site_data: Value) -> Result<(), ApiError> {
        let url = format!("{}/api/items/{}/updatesite", self.base_url, site_id);
        let payload = RecordPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
            data: site_data,
        };

        info!(site_id = site_id, url = %url, "API リクエスト送信");

        let response = self
            .client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                error!(site_id = site_id, url = %url, error = %e, "API リクエスト失敗");
                ApiError::RequestError { site_id, message: e.to_string() }
            })?;

        let status = response.status().as_u16();
        debug!(site_id = site_id, status = status, "API レスポンス受信");

        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let log_msg = if text.contains("<!DOCTYPE") || text.contains("<html") {
                format!("HTML エラーページ（{} bytes）", text.len())
            } else {
                text.chars().take(500).collect::<String>()
            };
            error!(site_id = site_id, status = status, message = %log_msg, "HTTP エラー");
            return Err(ApiError::HttpError { site_id, status_code: status, message: log_msg });
        }

        let body: ApiResponse = response.json().await.map_err(|e| {
            error!(site_id = site_id, error = %e, "レスポンス JSON パース失敗");
            ApiError::RequestError { site_id, message: e.to_string() }
        })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            warn!(site_id = site_id, api_status = api_status, message = %msg, "API エラー");
            return Err(ApiError::HttpError { site_id, status_code: api_status, message: msg });
        }

        info!(site_id = site_id, "updatesite 成功");
        Ok(())
    }

    /// サイトを作成（親サイト ID 配下に新規サイトを作成）
    /// 戻り値: 作成されたサイト ID
    pub async fn create_site(&self, parent_id: u64, site_data: Value) -> Result<u64, ApiError> {
        let url = format!("{}/api/items/{}/createsite", self.base_url, parent_id);
        let payload = RecordPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
            data: site_data,
        };

        info!(parent_id = parent_id, url = %url, "サイト作成リクエスト送信");

        let response = self.client.post(&url).json(&payload).send().await
            .map_err(|e| {
                error!(parent_id = parent_id, error = %e, "サイト作成リクエスト失敗");
                ApiError::RequestError { site_id: parent_id, message: e.to_string() }
            })?;

        let status = response.status().as_u16();
        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let msg = if text.contains("<html") { format!("HTTP {}", status) } else { text.chars().take(500).collect() };
            return Err(ApiError::HttpError { site_id: parent_id, status_code: status, message: msg });
        }

        let body: ApiResponse = response.json().await
            .map_err(|e| ApiError::RequestError { site_id: parent_id, message: e.to_string() })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            return Err(ApiError::HttpError { site_id: parent_id, status_code: api_status, message: msg });
        }

        let created_id = body.id.ok_or_else(|| {
            ApiError::HttpError { site_id: parent_id, status_code: api_status, message: "レスポンスに Id がありません".to_string() }
        })?;

        info!(parent_id = parent_id, created_id = created_id, "サイト作成成功");
        Ok(created_id)
    }

    /// サイトを削除
    pub async fn delete_site(&self, site_id: u64) -> Result<(), ApiError> {
        let url = format!("{}/api/items/{}/deletesite", self.base_url, site_id);
        let payload = self.base_payload();
        info!(site_id = site_id, url = %url, "サイト削除リクエスト送信");

        let response = self.client.post(&url).json(&payload).send().await
            .map_err(|e| ApiError::RequestError { site_id, message: e.to_string() })?;

        let status = response.status().as_u16();
        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let msg = if text.contains("<html") { format!("HTTP {}", status) } else { text.chars().take(500).collect() };
            return Err(ApiError::HttpError { site_id, status_code: status, message: msg });
        }

        let body: ApiResponse = response.json().await
            .map_err(|e| ApiError::RequestError { site_id, message: e.to_string() })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            return Err(ApiError::HttpError { site_id, status_code: api_status, message: msg });
        }

        info!(site_id = site_id, "サイト削除成功");
        Ok(())
    }

    /// レコードを作成（戻り値: 作成されたレコード ID）
    ///
    /// data のキーに応じて ClassHash/NumHash/DateHash 等に自動分類する。
    pub async fn create_record(&self, site_id: u64, data: Value) -> Result<u64, ApiError> {
        let url = format!("{}/api/items/{}/create", self.base_url, site_id);
        let payload = RecordPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
            data: split_hash(data),
        };

        info!(site_id = site_id, url = %url, "レコード作成リクエスト送信");

        let response = self.client.post(&url).json(&payload).send().await
            .map_err(|e| ApiError::RequestError { site_id, message: e.to_string() })?;

        let status = response.status().as_u16();
        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let msg = if text.contains("<html") { format!("HTTP {}", status) } else { text.chars().take(500).collect() };
            return Err(ApiError::HttpError { site_id, status_code: status, message: msg });
        }

        let body: ApiResponse = response.json().await
            .map_err(|e| ApiError::RequestError { site_id, message: e.to_string() })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            return Err(ApiError::HttpError { site_id, status_code: api_status, message: msg });
        }

        let created_id = body.id.ok_or_else(|| {
            ApiError::HttpError { site_id, status_code: api_status, message: "レスポンスに Id がありません".to_string() }
        })?;

        info!(site_id = site_id, created_id = created_id, "レコード作成成功");
        Ok(created_id)
    }

    /// レコードを更新
    ///
    /// data のキーに応じて ClassHash/NumHash/DateHash 等に自動分類する。
    pub async fn update_record(&self, record_id: u64, data: Value) -> Result<(), ApiError> {
        let url = format!("{}/api/items/{}/update", self.base_url, record_id);
        let payload = RecordPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
            data: split_hash(data),
        };
        info!(record_id = record_id, url = %url, "レコード更新リクエスト送信");

        let response = self.client.post(&url).json(&payload).send().await
            .map_err(|e| ApiError::RequestError { site_id: record_id, message: e.to_string() })?;

        let status = response.status().as_u16();
        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let msg = if text.contains("<html") { format!("HTTP {}", status) } else { text.chars().take(500).collect() };
            return Err(ApiError::HttpError { site_id: record_id, status_code: status, message: msg });
        }

        let body: ApiResponse = response.json().await
            .map_err(|e| ApiError::RequestError { site_id: record_id, message: e.to_string() })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            return Err(ApiError::HttpError { site_id: record_id, status_code: api_status, message: msg });
        }
        info!(record_id = record_id, "レコード更新成功");
        Ok(())
    }

    /// レコードを削除
    pub async fn delete_record(&self, record_id: u64) -> Result<(), ApiError> {
        let url = format!("{}/api/items/{}/delete", self.base_url, record_id);
        let payload = self.base_payload();
        info!(record_id = record_id, url = %url, "レコード削除リクエスト送信");

        let response = self.client.post(&url).json(&payload).send().await
            .map_err(|e| ApiError::RequestError { site_id: record_id, message: e.to_string() })?;

        let status = response.status().as_u16();
        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let msg = if text.contains("<html") { format!("HTTP {}", status) } else { text.chars().take(500).collect() };
            return Err(ApiError::HttpError { site_id: record_id, status_code: status, message: msg });
        }

        let body: ApiResponse = response.json().await
            .map_err(|e| ApiError::RequestError { site_id: record_id, message: e.to_string() })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            return Err(ApiError::HttpError { site_id: record_id, status_code: api_status, message: msg });
        }
        info!(record_id = record_id, "レコード削除成功");
        Ok(())
    }

    /// レコードデータを取得（全件ページネーション）
    pub async fn get_records(&self, site_id: u64) -> Result<Vec<Value>, ApiError> {
        self.get_records_with_options(site_id, None).await
    }

    /// レコードデータを取得（オプション付き）
    /// 注意: napi-rs の tokio ランタイムでループ内の複数 await がハングする問題があるため、
    /// 単一リクエストで最大 10000 件を取得する実装に変更
    pub async fn get_records_with_options(
        &self,
        site_id: u64,
        options: Option<Value>,
    ) -> Result<Vec<Value>, ApiError> {
        let url = format!("{}/api/items/{}/get", self.base_url, site_id);

        // 単一リクエストで最大件数を取得（ページネーションなし）
        let mut view = options.unwrap_or_else(|| serde_json::json!({}));
        if let Some(obj) = view.as_object_mut() {
            // PageSize が指定されていない場合は 10000 を設定
            if !obj.contains_key("PageSize") {
                obj.insert("PageSize".to_string(), serde_json::json!(10000));
            }
        }

        let payload = RecordPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
            data: serde_json::json!({ "View": view }),
        };

        let data = self.post_request(&url, &payload, site_id).await?;

        if let Some(arr) = data.as_array() {
            Ok(arr.to_vec())
        } else {
            Ok(vec![])
        }
    }

    /// 単一レコードを取得
    pub async fn get_record(
        &self,
        record_id: u64,
        options: Option<Value>,
    ) -> Result<Value, ApiError> {
        let url = format!("{}/api/items/{}/get", self.base_url, record_id);
        let view = options.unwrap_or_else(|| serde_json::json!({}));
        let payload = RecordPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
            data: serde_json::json!({ "View": view }),
        };

        let data = self.post_request(&url, &payload, record_id).await?;

        // Response.Data は配列なので最初の要素を返す
        if let Some(arr) = data.as_array() {
            Ok(arr.first().cloned().unwrap_or(Value::Null))
        } else {
            Ok(data)
        }
    }

    fn base_payload(&self) -> ApiPayload {
        ApiPayload {
            api_version: self.api_version.clone(),
            api_key: self.api_key.clone(),
        }
    }

}

/// Pleasanter API 形式にフラットなキーを Hash 形式に分類
///
/// { "ClassA": "val", "NumA": 1, "Status": 200 }
/// → { "ClassHash": { "ClassA": "val" }, "NumHash": { "NumA": 1 }, "Status": 200 }
fn split_hash(data: Value) -> Value {
    let obj = match data.as_object() {
        Some(o) => o,
        None => return data,
    };

    let empty_date = serde_json::json!("1899-12-30T00:00:00");
    let mut class_hash = serde_json::Map::new();
    let mut num_hash = serde_json::Map::new();
    let mut date_hash = serde_json::Map::new();
    let mut description_hash = serde_json::Map::new();
    let mut check_hash = serde_json::Map::new();
    let mut other = serde_json::Map::new();

    for (k, v) in obj {
        if k.contains("Class") {
            class_hash.insert(k.clone(), v.clone());
        } else if k.contains("Num") {
            num_hash.insert(k.clone(), v.clone());
        } else if k.contains("Date") {
            let val = if v.is_null() || v == "" { empty_date.clone() } else { v.clone() };
            date_hash.insert(k.clone(), val);
        } else if k.contains("Description") {
            description_hash.insert(k.clone(), v.clone());
        } else if k.contains("Check") {
            check_hash.insert(k.clone(), v.clone());
        } else {
            other.insert(k.clone(), v.clone());
        }
    }

    if !class_hash.is_empty() { other.insert("ClassHash".to_string(), Value::Object(class_hash)); }
    if !num_hash.is_empty() { other.insert("NumHash".to_string(), Value::Object(num_hash)); }
    if !date_hash.is_empty() { other.insert("DateHash".to_string(), Value::Object(date_hash)); }
    if !description_hash.is_empty() { other.insert("DescriptionHash".to_string(), Value::Object(description_hash)); }
    if !check_hash.is_empty() { other.insert("CheckHash".to_string(), Value::Object(check_hash)); }

    Value::Object(other)
}

impl PleasanterClient {
    async fn post_request<T: Serialize>(
        &self,
        url: &str,
        payload: &T,
        id: u64,
    ) -> Result<Value, ApiError> {
        info!(site_id = id, url = url, "API リクエスト送信");

        let response = self
            .client
            .post(url)
            .json(payload)
            .send()
            .await
            .map_err(|e| {
                error!(site_id = id, url = url, error = %e, "API リクエスト失敗");
                ApiError::RequestError {
                    site_id: id,
                    message: e.to_string(),
                }
            })?;

        let status = response.status().as_u16();
        debug!(site_id = id, status = status, "API レスポンス受信");

        if status >= 400 {
            let text = response.text().await.unwrap_or_default();
            let log_msg = if text.contains("<!DOCTYPE") || text.contains("<html") {
                format!("HTML エラーページ（{} bytes）", text.len())
            } else {
                text.chars().take(500).collect::<String>()
            };
            error!(site_id = id, status = status, message = %log_msg, "HTTP エラー");
            return Err(ApiError::HttpError {
                site_id: id,
                status_code: status,
                message: log_msg,
            });
        }

        let body: ApiResponse = response.json().await.map_err(|e| {
            error!(site_id = id, error = %e, "レスポンス JSON パース失敗");
            ApiError::RequestError {
                site_id: id,
                message: e.to_string(),
            }
        })?;

        let api_status = body.status_code.unwrap_or(0);
        if api_status != 200 {
            let msg = body.message.unwrap_or_else(|| "不明なエラー".to_string());
            warn!(site_id = id, api_status = api_status, message = %msg, "API エラー");
            return Err(ApiError::HttpError {
                site_id: id,
                status_code: api_status,
                message: msg,
            });
        }

        info!(site_id = id, "API リクエスト成功");
        body.response
            .and_then(|r| r.data)
            .ok_or_else(|| {
                error!(site_id = id, "Response.Data が存在しません");
                ApiError::HttpError {
                    site_id: id,
                    status_code: api_status,
                    message: "Response.Data が存在しません".to_string(),
                }
            })
    }
}
