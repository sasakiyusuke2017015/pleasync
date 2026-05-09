use serde_json::{Map, Value};

/// 除外するキー
const EXCLUDE_KEYS: &[&str] = &[
    // タイムスタンプ・メタ
    "UpdatedTime",
    "CreatedTime",
    "Creator",
    "Updator",
    "Guid",
    "Ver",
    // API メタ情報（リモートのみ）
    "ApiCount",
    "ApiCountDate",
    "ApiVersion",
    // サーバー管理フィールド（リモートのみ）
    "LockedTime",
    "LockedUser",
    "Permissions",
    "Comments",
    // 空ハッシュ（リモートのみ、ローカルには存在しない）
    "AttachmentsHash",
    "CheckHash",
    "ClassHash",
    "NumHash",
    "DateHash",
    "DescriptionHash",
];

/// デフォルト日付（Pleasanter の未設定値）
const DEFAULT_DATES: &[&str] = &[
    "1899-12-30T00:00:00",
    "0001-01-01T00:00:00",
];

/// 意味のない空値を判定
fn is_empty_value(val: &Value) -> bool {
    match val {
        Value::Null => true,
        Value::String(s) => s.is_empty() || DEFAULT_DATES.contains(&s.as_str()),
        Value::Array(arr) => arr.is_empty(),
        Value::Object(obj) => obj.is_empty(),
        Value::Number(n) => n.as_f64() == Some(0.0),
        Value::Bool(false) => true,
        _ => false,
    }
}

/// JSON のキーをソート（exclude_keys に該当するキーは除外）
fn sort_and_filter(value: &Value, exclude_keys: &[&str]) -> Value {
    match value {
        Value::Object(obj) => {
            let mut sorted: Map<String, Value> = Map::new();
            let mut keys: Vec<&String> = obj.keys().collect();
            keys.sort();

            for key in keys {
                if exclude_keys.contains(&key.as_str()) {
                    continue;
                }
                let val = &obj[key];
                // 意味のない空値を除外
                if is_empty_value(val) {
                    continue;
                }
                sorted.insert(key.clone(), sort_and_filter(val, exclude_keys));
            }
            Value::Object(sorted)
        }
        Value::Array(arr) => {
            Value::Array(arr.iter().map(|v| sort_and_filter(v, exclude_keys)).collect())
        }
        other => other.clone(),
    }
}

/// JSON を正規化（不要キー除外 + キーソート）
pub fn normalize(value: &Value) -> Value {
    sort_and_filter(value, EXCLUDE_KEYS)
}

/// キーをソートして JSON 文字列化（除外なし）
pub fn sorted_json_stringify(value: &Value, indent: usize) -> String {
    let sorted = sort_and_filter(value, &[]);
    if indent == 0 {
        serde_json::to_string(&sorted).unwrap_or_default()
    } else {
        serde_json::to_string_pretty(&sorted).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_normalize_excludes_keys() {
        let input = json!({
            "SiteId": 123,
            "UpdatedTime": "2024-01-01",
            "CreatedTime": "2024-01-01",
            "Creator": "user",
            "Updator": "user",
            "Guid": "abc",
            "Ver": 1,
            "Title": "Test"
        });

        let result = normalize(&input);
        let obj = result.as_object().unwrap();

        assert!(obj.contains_key("SiteId"));
        assert!(obj.contains_key("Title"));
        assert!(!obj.contains_key("UpdatedTime"));
        assert!(!obj.contains_key("CreatedTime"));
        assert!(!obj.contains_key("Creator"));
        assert!(!obj.contains_key("Updator"));
        assert!(!obj.contains_key("Guid"));
        assert!(!obj.contains_key("Ver"));
    }

    #[test]
    fn test_normalize_sorts_keys() {
        let input = json!({
            "z": 1,
            "a": 2,
            "m": 3
        });

        let result = normalize(&input);
        let keys: Vec<&String> = result.as_object().unwrap().keys().collect();

        assert_eq!(keys, vec!["a", "m", "z"]);
    }

    #[test]
    fn test_normalize_nested() {
        let input = json!({
            "outer": {
                "UpdatedTime": "should be removed",
                "inner": "value"
            }
        });

        let result = normalize(&input);
        let outer = result["outer"].as_object().unwrap();

        assert!(outer.contains_key("inner"));
        assert!(!outer.contains_key("UpdatedTime"));
    }

    #[test]
    fn test_normalize_removes_empty_values() {
        let input = json!({
            "SiteId": 123,
            "Title": "Test",
            "Body": "",
            "Comments": [],
            "Permissions": [],
            "EmptyObj": {},
            "ZeroNum": 0,
            "FalseBool": false,
            "NullVal": null,
            "DefaultDate": "1899-12-30T00:00:00",
            "ActualValue": "real data"
        });

        let result = normalize(&input);
        let obj = result.as_object().unwrap();

        assert!(obj.contains_key("SiteId"));
        assert!(obj.contains_key("Title"));
        assert!(obj.contains_key("ActualValue"));
        assert!(!obj.contains_key("Body"));
        assert!(!obj.contains_key("Comments"));
        assert!(!obj.contains_key("Permissions"));
        assert!(!obj.contains_key("EmptyObj"));
        assert!(!obj.contains_key("ZeroNum"));
        assert!(!obj.contains_key("FalseBool"));
        assert!(!obj.contains_key("NullVal"));
        assert!(!obj.contains_key("DefaultDate"));
    }

    #[test]
    fn test_sorted_json_stringify() {
        let input = json!({"b": 1, "a": 2});
        let result = sorted_json_stringify(&input, 0);

        assert_eq!(result, r#"{"a":2,"b":1}"#);
    }
}
