#![deny(clippy::all)]

mod client;
pub mod error;
pub mod normalizer;
pub mod schema;
pub mod tree;
mod types;

pub use client::PleasanterClient;
pub use error::ApiError;
pub use schema::{load_site_package, parse_site_package, ColumnDef, FieldType, PackageSchema, SiteSchema};
pub use tree::{build_tree, Convertor, SiteNode};
pub use types::ConnectionConfig;

// ─── napi-rs バインディング（Node.js 向け） ──────────────

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Node.js 向け Pleasanter クライアント
#[napi(js_name = "PleasanterClient")]
pub struct JsPleasanterClient {
    inner: PleasanterClient,
}

#[napi]
impl JsPleasanterClient {
    /// 新しいクライアントを作成
    ///
    /// ```js
    /// const client = new PleasanterClient({
    ///   baseUrl: 'https://pleasanter.example.com',
    ///   apiKey: 'your-key',
    ///   apiVersion: '1.1',
    /// })
    /// ```
    #[napi(constructor)]
    pub fn new(config: JsConnectionConfig) -> Self {
        let inner = PleasanterClient::new(&ConnectionConfig {
            base_url: config.base_url,
            api_key: config.api_key,
            api_version: config.api_version,
        });
        Self { inner }
    }

    /// サイト情報を取得
    #[napi]
    pub async fn get_site(&self, site_id: f64) -> Result<serde_json::Value> {
        self.inner
            .get_site(site_id as u64)
            .await
            .map_err(to_napi_error)
    }

    /// サイト設定を更新
    #[napi]
    pub async fn update_site(&self, site_id: f64, site_data: serde_json::Value) -> Result<()> {
        self.inner
            .update_site(site_id as u64, site_data)
            .await
            .map_err(to_napi_error)
    }

    /// サイトを作成（親サイト ID 配下に新規作成）
    /// 戻り値: 作成されたサイト ID
    ///
    /// ```js
    /// const siteId = await client.createSite(parentId, {
    ///   Title: 'ユーザーマスタ',
    ///   ReferenceType: 'Results',
    ///   SiteSettings: { ... }
    /// })
    /// ```
    #[napi]
    pub async fn create_site(&self, parent_id: f64, site_data: serde_json::Value) -> Result<f64> {
        self.inner
            .create_site(parent_id as u64, site_data)
            .await
            .map(|id| id as f64)
            .map_err(to_napi_error)
    }

    /// サイトを削除
    ///
    /// ```js
    /// await client.deleteSite(12345)
    /// ```
    #[napi]
    pub async fn delete_site(&self, site_id: f64) -> Result<()> {
        self.inner
            .delete_site(site_id as u64)
            .await
            .map_err(to_napi_error)
    }

    /// レコードデータを全件取得
    #[napi]
    pub async fn get_records(&self, site_id: f64) -> Result<Vec<serde_json::Value>> {
        self.inner
            .get_records(site_id as u64)
            .await
            .map_err(to_napi_error)
    }

    /// レコードデータを取得（オプション付き）
    ///
    /// ```js
    /// const records = await client.getRecordsWithOptions(12345, {
    ///   ApiDataType: 'KeyValues',
    ///   ApiColumnKeyDisplayType: 'LabelText',
    ///   GridColumns: ['ClassA', 'ClassB'],
    ///   ColumnFilterHash: { ClassA: '["value"]' }
    /// })
    /// ```
    #[napi]
    pub async fn get_records_with_options(
        &self,
        site_id: f64,
        options: Option<serde_json::Value>,
    ) -> Result<Vec<serde_json::Value>> {
        self.inner
            .get_records_with_options(site_id as u64, options)
            .await
            .map_err(to_napi_error)
    }

    /// 単一レコードを取得
    ///
    /// ```js
    /// const record = await client.getRecord(12345, {
    ///   ApiDataType: 'KeyValues',
    ///   ApiColumnKeyDisplayType: 'LabelText'
    /// })
    /// ```
    #[napi]
    pub async fn get_record(
        &self,
        record_id: f64,
        options: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        self.inner
            .get_record(record_id as u64, options)
            .await
            .map_err(to_napi_error)
    }

    /// レコードを作成（戻り値: 作成されたレコード ID）
    ///
    /// ```js
    /// const recordId = await client.createRecord(12345, {
    ///   ClassHash: { ClassA: 'value' }
    /// })
    /// ```
    #[napi]
    pub async fn create_record(
        &self,
        site_id: f64,
        data: serde_json::Value,
    ) -> Result<f64> {
        self.inner
            .create_record(site_id as u64, data)
            .await
            .map(|id| id as f64)
            .map_err(to_napi_error)
    }

    /// レコードを更新
    ///
    /// ```js
    /// await client.updateRecord(12345, {
    ///   ClassHash: { ClassA: 'new-value' }
    /// })
    /// ```
    #[napi]
    pub async fn update_record(&self, record_id: f64, data: serde_json::Value) -> Result<()> {
        self.inner
            .update_record(record_id as u64, data)
            .await
            .map_err(to_napi_error)
    }

    /// レコードを削除
    ///
    /// ```js
    /// await client.deleteRecord(12345)
    /// ```
    #[napi]
    pub async fn delete_record(&self, record_id: f64) -> Result<()> {
        self.inner
            .delete_record(record_id as u64)
            .await
            .map_err(to_napi_error)
    }
}

/// 接続情報（JS 向け）
#[napi(object, js_name = "ConnectionConfig")]
pub struct JsConnectionConfig {
    pub base_url: String,
    pub api_key: String,
    pub api_version: String,
}

/// JSON を正規化（不要キー除外 + キーソート）
#[napi]
pub fn normalize(value: serde_json::Value) -> serde_json::Value {
    normalizer::normalize(&value)
}

/// キーをソートして JSON 文字列化
#[napi]
pub fn sorted_json_stringify(value: serde_json::Value, indent: Option<u32>) -> String {
    normalizer::sorted_json_stringify(&value, indent.unwrap_or(0) as usize)
}

// ─── スキーマ関連のバインディング ──────────────────────────

/// サイトパッケージ JSON を読み込んでスキーマを生成
#[napi(js_name = "loadSitePackage")]
pub fn js_load_site_package(path: String) -> Result<JsPackageSchema> {
    let schema = load_site_package(&path).map_err(to_napi_error)?;
    Ok(JsPackageSchema { inner: schema })
}

/// サイトパッケージ JSON（オブジェクト）からスキーマを生成
#[napi(js_name = "parseSitePackage")]
pub fn js_parse_site_package(package: serde_json::Value) -> Result<JsPackageSchema> {
    let schema = parse_site_package(&package).map_err(to_napi_error)?;
    Ok(JsPackageSchema { inner: schema })
}

/// Node.js 向けパッケージスキーマ
#[napi(js_name = "PackageSchema")]
pub struct JsPackageSchema {
    inner: PackageSchema,
}

#[napi]
impl JsPackageSchema {
    /// JSON からパッケージスキーマを構築（内部用）
    #[napi(constructor)]
    pub fn new(package: serde_json::Value) -> Result<Self> {
        let schema = parse_site_package(&package).map_err(to_napi_error)?;
        Ok(Self { inner: schema })
    }

    /// ルートサイト ID を取得
    #[napi(getter)]
    pub fn base_site_id(&self) -> f64 {
        self.inner.base_site_id as f64
    }

    /// サーバー URL を取得
    #[napi(getter)]
    pub fn server_url(&self) -> Option<String> {
        self.inner.server_url.clone()
    }

    /// サイト一覧（タイトル）を取得
    #[napi]
    pub fn get_site_titles(&self) -> Vec<String> {
        self.inner.title_to_site_id.keys().cloned().collect()
    }

    /// タイトルからサイト ID を取得
    #[napi]
    pub fn get_site_id(&self, title: String) -> Option<f64> {
        self.inner.title_to_site_id.get(&title).map(|id| *id as f64)
    }

    /// タイトルからサイトスキーマを取得
    #[napi]
    pub fn get_site(&self, title: String) -> Option<JsSiteSchema> {
        self.inner
            .get_site_by_title(&title)
            .map(|s| JsSiteSchema { inner: s.clone() })
    }

    /// サイト ID からサイトスキーマを取得
    #[napi]
    pub fn get_site_by_id(&self, site_id: f64) -> Option<JsSiteSchema> {
        self.inner
            .get_site(site_id as u64)
            .map(|s| JsSiteSchema { inner: s.clone() })
    }

    /// スキーマ全体を JSON として取得
    #[napi]
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(&self.inner).unwrap_or(serde_json::Value::Null)
    }
}

/// Node.js 向けサイトスキーマ
#[napi(js_name = "SiteSchema")]
pub struct JsSiteSchema {
    inner: SiteSchema,
}

#[napi]
impl JsSiteSchema {
    // napi-rs が JS クラスとして expose するために constructor を要求するための
    // ダミー実装。Rust 側からは使わないため Default は意図的に未実装。
    #[allow(clippy::new_without_default)]
    /// ダミーコンストラクタ（napi-rs の制約回避用、直接使用禁止）
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: SiteSchema {
                site_id: 0,
                title: String::new(),
                reference_type: String::new(),
                columns: std::collections::HashMap::new(),
                label_to_column: std::collections::HashMap::new(),
            },
        }
    }

    /// サイト ID を取得
    #[napi(getter)]
    pub fn site_id(&self) -> f64 {
        self.inner.site_id as f64
    }

    /// タイトルを取得
    #[napi(getter)]
    pub fn title(&self) -> String {
        self.inner.title.clone()
    }

    /// リファレンスタイプを取得
    #[napi(getter)]
    pub fn reference_type(&self) -> String {
        self.inner.reference_type.clone()
    }

    /// ラベル名からカラム名を取得
    #[napi]
    pub fn get_column_name(&self, label: String) -> Option<String> {
        self.inner.get_column_name(&label).map(|s| s.to_string())
    }

    /// カラム名からラベル名を取得
    #[napi]
    pub fn get_label(&self, column_name: String) -> Option<String> {
        self.inner.get_label(&column_name).map(|s| s.to_string())
    }

    /// 全カラム名を取得
    #[napi]
    pub fn get_column_names(&self) -> Vec<String> {
        self.inner.columns.keys().cloned().collect()
    }

    /// 全ラベルを取得
    #[napi]
    pub fn get_labels(&self) -> Vec<String> {
        self.inner.label_to_column.keys().cloned().collect()
    }

    /// カラム名から選択肢一覧を取得
    ///
    /// ```js
    /// const choices = site.getChoices('Status')
    /// // → [{ value: '100', label: '未掲載', shortLabel: '未掲載', color: null }, ...]
    /// ```
    #[napi]
    pub fn get_choices(&self, column_name: String) -> Vec<serde_json::Value> {
        self.inner
            .get_choices(&column_name)
            .map(|choices| {
                choices
                    .iter()
                    .map(|c| {
                        let mut obj = serde_json::json!({
                            "value": c.value,
                            "label": c.label,
                            "shortLabel": c.short_label,
                        });
                        // properties を展開してトップレベルに配置
                        if let serde_json::Value::Object(ref mut map) = obj {
                            for (k, v) in &c.properties {
                                map.insert(k.clone(), serde_json::Value::String(v.clone()));
                            }
                        }
                        obj
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// スキーマを JSON として取得
    #[napi]
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(&self.inner).unwrap_or(serde_json::Value::Null)
    }
}

fn to_napi_error(e: ApiError) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}
