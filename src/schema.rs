//! サイトパッケージスキーマ解析モジュール
//!
//! Pleasanter のサイトパッケージ JSON からスキーマ情報を抽出する。

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;
use crate::tree::{build_tree, Convertor, SiteNode};

/// カラム定義
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDef {
    /// カラム名（ClassA, NumA, Status など）
    pub column_name: String,
    /// ラベル（日本語名）
    pub label_text: String,
    /// フィールドタイプ
    pub field_type: FieldType,
    /// 選択肢（Status, Class 系のみ）
    pub choices: Vec<ChoiceItem>,
}

/// フィールドタイプ
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FieldType {
    Text,
    Status,
    Class,
    Num,
    Date,
    Description,
    Check,
    /// その他（Title, Body, ResultId など）
    Other,
}

/// 選択肢アイテム
///
/// 列数に応じたフォーマット:
/// - 1列: "label"
/// - 2列: "value,label"
/// - 4列: "value,label,shortLabel,cssClass"
/// - 5列+: "value,label,shortLabel,cssClass,{key=value}"
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChoiceItem {
    pub value: String,
    pub label: String,
    pub short_label: Option<String>,
    /// 5列目の {key=value} をパースしたプロパティ
    pub properties: HashMap<String, String>,
}

/// サイトスキーマ（テーブル定義）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteSchema {
    pub site_id: u64,
    pub title: String,
    pub reference_type: String,
    /// カラム名 → カラム定義
    pub columns: HashMap<String, ColumnDef>,
    /// ラベル → カラム名（逆引き）
    pub label_to_column: HashMap<String, String>,
}

impl SiteSchema {
    /// ラベル名からカラム名を取得
    pub fn get_column_name(&self, label: &str) -> Option<&str> {
        self.label_to_column.get(label).map(|s| s.as_str())
    }

    /// カラム名からラベル名を取得
    pub fn get_label(&self, column_name: &str) -> Option<&str> {
        self.columns.get(column_name).map(|c| c.label_text.as_str())
    }

    /// カラム名から選択肢一覧を取得
    pub fn get_choices(&self, column_name: &str) -> Option<&Vec<ChoiceItem>> {
        self.columns.get(column_name).map(|c| &c.choices)
    }
}

/// パッケージスキーマ（複数サイトを含む）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageSchema {
    /// ルートサイト ID
    pub base_site_id: u64,
    /// サーバー URL（HeaderInfo.Server から検出）
    pub server_url: Option<String>,
    /// サイトツリー
    pub tree: SiteNode,
    /// サイト ID → スキーマ
    pub sites: HashMap<u64, SiteSchema>,
    /// タイトル → サイト ID（逆引き）
    pub title_to_site_id: HashMap<String, u64>,
}

impl PackageSchema {
    /// タイトルからサイトスキーマを取得
    pub fn get_site_by_title(&self, title: &str) -> Option<&SiteSchema> {
        self.title_to_site_id
            .get(title)
            .and_then(|id| self.sites.get(id))
    }

    /// サイト ID からサイトスキーマを取得
    pub fn get_site(&self, site_id: u64) -> Option<&SiteSchema> {
        self.sites.get(&site_id)
    }
}

/// サイトパッケージ JSON を読み込んでスキーマを生成
pub fn load_site_package(path: impl AsRef<Path>) -> Result<PackageSchema, ApiError> {
    let raw = fs::read_to_string(path.as_ref())?;
    // BOM 除去
    let content = raw.trim_start_matches('\u{FEFF}');
    let package: Value = serde_json::from_str(content)?;
    parse_site_package(&package)
}

/// サイトパッケージ JSON（Value）からスキーマを生成
pub fn parse_site_package(package: &Value) -> Result<PackageSchema, ApiError> {
    // HeaderInfo を取得
    let header = package
        .get("HeaderInfo")
        .ok_or_else(|| ApiError::PackageError("HeaderInfo が見つかりません".to_string()))?;

    let base_site_id = header
        .get("BaseSiteId")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ApiError::PackageError("BaseSiteId が見つかりません".to_string()))?;

    let server_url = header
        .get("Server")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Convertors からツリーを構築
    let convertors_val = header
        .get("Convertors")
        .ok_or_else(|| ApiError::PackageError("Convertors が見つかりません".to_string()))?;

    let convertors: Vec<Convertor> = serde_json::from_value(convertors_val.clone())?;
    let tree = build_tree(&convertors, base_site_id)?;

    // Sites 配列を取得
    let sites_arr = package
        .get("Sites")
        .and_then(|s| s.as_array())
        .ok_or_else(|| ApiError::PackageError("Sites が見つかりません".to_string()))?;

    // 各サイトを解析
    let mut sites: HashMap<u64, SiteSchema> = HashMap::new();
    let mut title_to_site_id: HashMap<String, u64> = HashMap::new();

    for site in sites_arr {
        let site_id = site
            .get("SiteId")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| ApiError::PackageError("SiteId が見つかりません".to_string()))?;

        let title = site
            .get("Title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let reference_type = site
            .get("ReferenceType")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // SiteSettings.Columns からカラム定義を抽出
        let mut columns = extract_columns(site);

        // Wiki サイトの場合: Body を区分値としてパースし、仮想カラム "Body" に格納
        if reference_type == "Wikis" {
            let body = site
                .get("Body")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let choices = parse_wiki_body(body);
            if !choices.is_empty() {
                columns.insert(
                    "Body".to_string(),
                    ColumnDef {
                        column_name: "Body".to_string(),
                        label_text: "区分値".to_string(),
                        field_type: FieldType::Other,
                        choices,
                    },
                );
            }
        }

        let label_to_column: HashMap<String, String> = columns
            .iter()
            .map(|(name, def)| (def.label_text.clone(), name.clone()))
            .collect();

        title_to_site_id.insert(title.clone(), site_id);
        sites.insert(
            site_id,
            SiteSchema {
                site_id,
                title,
                reference_type,
                columns,
                label_to_column,
            },
        );
    }

    Ok(PackageSchema {
        base_site_id,
        server_url,
        tree,
        sites,
        title_to_site_id,
    })
}

/// Pleasanter システムカラムのデフォルト日本語ラベル
///
/// SiteSettings.Columns に LabelText が設定されていない場合のフォールバック。
/// Pleasanter 標準のデフォルト名に準拠する。
/// プロジェクト固有のラベル（掲載ID, 回答ID 等）は Pleasanter の LabelText で設定すること。
fn get_system_column_label(column_name: &str) -> Option<&'static str> {
    match column_name {
        // Issues 系
        "IssueId" => Some("ID"),
        "StartTime" => Some("開始"),
        "CompletionTime" => Some("完了"),
        "ProgressRate" => Some("進捗率"),
        // Results 系
        "ResultId" => Some("ID"),
        // 共通
        "Title" => Some("タイトル"),
        "Body" => Some("内容"),
        "Status" => Some("状況"),
        "Manager" => Some("管理者"),
        "Owner" => Some("担当"),
        "CreatedTime" => Some("作成日時"),
        "UpdatedTime" => Some("更新日時"),
        "Creator" => Some("作成者"),
        "Updator" => Some("更新者"),
        _ => None,
    }
}

/// SiteSettings.Columns からカラム定義を抽出
fn extract_columns(site: &Value) -> HashMap<String, ColumnDef> {
    let mut columns = HashMap::new();

    let cols_arr = match site
        .get("SiteSettings")
        .and_then(|s| s.get("Columns"))
        .and_then(|c| c.as_array())
    {
        Some(arr) => arr,
        None => return columns,
    };

    for col in cols_arr {
        let column_name = match col.get("ColumnName").and_then(|v| v.as_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        // LabelText の優先順位:
        // 1. SiteSettings.Columns で明示的に設定された LabelText
        // 2. システムカラムのデフォルト日本語ラベル
        // 3. カラム名そのもの
        let explicit_label = col
            .get("LabelText")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());

        let label_text = explicit_label
            .map(|s| s.to_string())
            .or_else(|| get_system_column_label(&column_name).map(|s| s.to_string()))
            .unwrap_or_else(|| column_name.clone());

        let field_type = detect_field_type(&column_name);
        let choices = extract_choices(col);

        columns.insert(
            column_name.clone(),
            ColumnDef {
                column_name,
                label_text,
                field_type,
                choices,
            },
        );
    }

    // SiteSettings.Columns に含まれないシステムカラムも追加
    // （CompletionTime など、Columns 配列に含まれないがテーブルに存在するカラム）
    let reference_type = site
        .get("ReferenceType")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    add_missing_system_columns(&mut columns, reference_type);

    columns
}

/// Columns に含まれないシステムカラムを追加
fn add_missing_system_columns(columns: &mut HashMap<String, ColumnDef>, reference_type: &str) {
    let system_columns: &[&str] = match reference_type {
        "Issues" => &["IssueId", "Title", "Body", "Status", "StartTime", "CompletionTime", "ProgressRate", "Manager", "Owner", "CreatedTime", "UpdatedTime"],
        "Results" => &["ResultId", "Title", "Body", "Status", "Manager", "Owner", "CreatedTime", "UpdatedTime"],
        _ => &[],
    };

    for &col_name in system_columns {
        if !columns.contains_key(col_name) {
            if let Some(label) = get_system_column_label(col_name) {
                columns.insert(
                    col_name.to_string(),
                    ColumnDef {
                        column_name: col_name.to_string(),
                        label_text: label.to_string(),
                        field_type: detect_field_type(col_name),
                        choices: Vec::new(),
                    },
                );
            }
        }
    }
}

/// カラム名からフィールドタイプを推定
fn detect_field_type(column_name: &str) -> FieldType {
    if column_name == "Status" {
        FieldType::Status
    } else if column_name.starts_with("Class") {
        FieldType::Class
    } else if column_name.starts_with("Num") {
        FieldType::Num
    } else if column_name.starts_with("Date") {
        FieldType::Date
    } else if column_name.starts_with("Description") {
        FieldType::Description
    } else if column_name.starts_with("Check") {
        FieldType::Check
    } else {
        FieldType::Other
    }
}

/// ChoicesText から選択肢を抽出
fn extract_choices(col: &Value) -> Vec<ChoiceItem> {
    let choices_str = match col.get("ChoicesText").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s,
        _ => return Vec::new(),
    };

    let trimmed = choices_str.trim();

    // Link参照パターン [[SiteId]] はスキップ
    if trimmed.starts_with("[[") && trimmed.ends_with("]]") {
        return Vec::new();
    }

    parse_choices_lines(choices_str)
}

/// Wiki サイトの Body を区分値としてパース
fn parse_wiki_body(body: &str) -> Vec<ChoiceItem> {
    parse_choices_lines(body)
}

/// カンマ区切りテキストから選択肢をパース（共通）
///
/// 列数に応じたフォーマット:
/// - 1列: "label"                                    → value=label, label=label
/// - 2列: "value,label"                              → value, label
/// - 4列: "value,label,shortLabel,cssClass"           → value, label, shortLabel
/// - 5列+: "value,label,shortLabel,cssClass,{k=v}"    → value, label, shortLabel, properties
fn parse_choices_lines(text: &str) -> Vec<ChoiceItem> {
    let mut items = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.splitn(5, ',').collect();
        let (value, label, short_label, properties) = match parts.len() {
            // 1列: label のみ
            1 => (
                parts[0].to_string(),
                parts[0].to_string(),
                None,
                HashMap::new(),
            ),
            // 2列: value,label
            2 => (
                parts[0].to_string(),
                parts[1].to_string(),
                None,
                HashMap::new(),
            ),
            // 4列: value,label,shortLabel,cssClass
            4 => (
                parts[0].to_string(),
                parts[1].to_string(),
                Some(parts[2].trim().to_string()).filter(|s| !s.is_empty()),
                HashMap::new(),
            ),
            // 5列+: value,label,shortLabel,cssClass,{key=value}
            5.. => {
                let props = parse_object_field(parts[4].trim());
                (
                    parts[0].to_string(),
                    parts[1].to_string(),
                    Some(parts[2].trim().to_string()).filter(|s| !s.is_empty()),
                    props,
                )
            },
            // 3列: value,label,shortLabel として扱う
            _ => (
                parts[0].to_string(),
                parts[1].to_string(),
                parts.get(2).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                HashMap::new(),
            ),
        };

        items.push(ChoiceItem { value, label, short_label, properties });
    }

    items
}

/// {key=value} 形式のオブジェクトフィールドをパース
///
/// 例: "{color=gray}" → { "color": "gray" }
/// 例: "{color=gray,weight=bold}" → { "color": "gray", "weight": "bold" }
fn parse_object_field(s: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let trimmed = s.trim().trim_start_matches('{').trim_end_matches('}');
    if trimmed.is_empty() {
        return map;
    }
    for pair in trimmed.split(',') {
        let kv: Vec<&str> = pair.splitn(2, '=').collect();
        if kv.len() == 2 {
            let key = kv[0].trim().to_string();
            let val = kv[1].trim().to_string();
            if !key.is_empty() {
                map.insert(key, val);
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_simple_package() {
        let package = json!({
            "HeaderInfo": {
                "BaseSiteId": 100,
                "Server": "https://example.com",
                "Convertors": [
                    {"SiteId": 100, "SiteTitle": "Root", "ReferenceType": "Sites", "Order": "[101]"},
                    {"SiteId": 101, "SiteTitle": "Users", "ReferenceType": "Results", "Order": null}
                ]
            },
            "Sites": [
                {
                    "SiteId": 100,
                    "Title": "Root",
                    "ReferenceType": "Sites",
                    "SiteSettings": {}
                },
                {
                    "SiteId": 101,
                    "Title": "ユーザーマスタ",
                    "ReferenceType": "Results",
                    "SiteSettings": {
                        "Columns": [
                            {"ColumnName": "ClassA", "LabelText": "ユーザーコード"},
                            {"ColumnName": "ClassB", "LabelText": "名前"},
                            {"ColumnName": "ClassE", "LabelText": "メールアドレス"}
                        ]
                    }
                }
            ]
        });

        let schema = parse_site_package(&package).unwrap();

        assert_eq!(schema.base_site_id, 100);
        assert_eq!(schema.server_url, Some("https://example.com".to_string()));
        assert_eq!(schema.sites.len(), 2);

        // タイトルからサイトを取得
        let users = schema.get_site_by_title("ユーザーマスタ").unwrap();
        assert_eq!(users.site_id, 101);

        // 明示的に SiteSettings.Columns で定義されたカラムが含まれる
        assert!(users.columns.contains_key("ClassA"));
        assert!(users.columns.contains_key("ClassB"));
        assert!(users.columns.contains_key("ClassE"));

        // Results 型のシステムカラムが add_missing_system_columns で自動追加される
        assert!(users.columns.contains_key("ResultId"));
        assert!(users.columns.contains_key("Title"));
        assert!(users.columns.contains_key("Status"));

        // ラベルからカラム名を取得
        assert_eq!(users.get_column_name("メールアドレス"), Some("ClassE"));
        assert_eq!(users.get_label("ClassA"), Some("ユーザーコード"));
    }

    #[test]
    fn test_extract_choices() {
        let col = json!({
            "ColumnName": "Status",
            "ChoicesText": "100,新規\n200,処理中\n300,完了"
        });

        let choices = extract_choices(&col);
        assert_eq!(choices.len(), 3);
        assert_eq!(choices[0].value, "100");
        assert_eq!(choices[0].label, "新規");
    }

    #[test]
    fn test_parse_4_columns() {
        // 4列: value,label,shortLabel,cssClass
        let body = "100,未掲載,未掲載,status-new\n150,予約,予約,status-preparation";
        let choices = parse_wiki_body(body);
        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].value, "100");
        assert_eq!(choices[0].label, "未掲載");
        assert_eq!(choices[0].short_label, Some("未掲載".to_string()));
        assert!(choices[0].properties.is_empty());
    }

    #[test]
    fn test_parse_5_columns_with_object() {
        // 5列: value,label,shortLabel,cssClass,{key=value}
        let body = "100,未判定,未判定,status-no_data,{color=gray}\n200,非常に良好,最高,status-excellent,{color=blue}";
        let choices = parse_wiki_body(body);
        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].label, "未判定");
        assert_eq!(choices[0].short_label, Some("未判定".to_string()));
        assert_eq!(choices[0].properties.get("color"), Some(&"gray".to_string()));
        assert_eq!(choices[1].properties.get("color"), Some(&"blue".to_string()));
    }

    #[test]
    fn test_parse_2_columns() {
        // 2列: value,label
        let body = "1,電話\n2,対面";
        let choices = parse_wiki_body(body);
        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].value, "1");
        assert_eq!(choices[0].label, "電話");
        assert_eq!(choices[0].short_label, None);
    }

    #[test]
    fn test_parse_1_column() {
        // 1列: label のみ
        let body = "電話\n対面";
        let choices = parse_wiki_body(body);
        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].value, "電話");
        assert_eq!(choices[0].label, "電話");
    }

    #[test]
    fn test_wiki_site_body_parsed() {
        let package = json!({
            "HeaderInfo": {
                "BaseSiteId": 100,
                "Convertors": [
                    {"SiteId": 100, "SiteTitle": "Root", "ReferenceType": "Sites", "Order": "[101]"},
                    {"SiteId": 101, "SiteTitle": "掲載状況区分", "ReferenceType": "Wikis", "Order": null}
                ]
            },
            "Sites": [
                {
                    "SiteId": 100,
                    "Title": "Root",
                    "ReferenceType": "Sites",
                    "SiteSettings": {}
                },
                {
                    "SiteId": 101,
                    "Title": "掲載状況区分",
                    "ReferenceType": "Wikis",
                    "Body": "100,未掲載,未掲載,status-new\n150,予約,予約,status-preparation",
                    "SiteSettings": {}
                }
            ]
        });

        let schema = parse_site_package(&package).unwrap();
        let wiki = schema.get_site_by_title("掲載状況区分").unwrap();

        // Wiki の Body が仮想カラム "Body" の choices として格納される
        let choices = wiki.get_choices("Body").unwrap();
        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].value, "100");
        assert_eq!(choices[0].label, "未掲載");
        assert_eq!(choices[1].value, "150");
        assert_eq!(choices[1].label, "予約");
    }

    #[test]
    fn test_detect_field_type() {
        assert_eq!(detect_field_type("Status"), FieldType::Status);
        assert_eq!(detect_field_type("ClassA"), FieldType::Class);
        assert_eq!(detect_field_type("NumA"), FieldType::Num);
        assert_eq!(detect_field_type("DateA"), FieldType::Date);
        assert_eq!(detect_field_type("DescriptionA"), FieldType::Description);
        assert_eq!(detect_field_type("CheckA"), FieldType::Check);
        assert_eq!(detect_field_type("Title"), FieldType::Other);
    }
}
