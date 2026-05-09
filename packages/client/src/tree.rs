//! サイトパッケージツリー構築モジュール
//!
//! Pleasanter のサイトパッケージ JSON から階層構造を構築する。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::ApiError;

/// Convertor エントリ（サイトパッケージの HeaderInfo.Convertors）
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Convertor {
    pub site_id: u64,
    pub site_title: String,
    pub reference_type: String,
    pub order: Option<String>,
}

/// サイトノード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteNode {
    pub site_id: u64,
    pub title: String,
    pub reference_type: String,
    pub children: Vec<SiteNode>,
}

/// フォルダ名に使えない文字を _ に置換
pub fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Convertors 配列からサイトツリーを構築
pub fn build_tree(convertors: &[Convertor], base_site_id: u64) -> Result<SiteNode, ApiError> {
    let lookup: HashMap<u64, &Convertor> = convertors.iter().map(|c| (c.site_id, c)).collect();

    if !lookup.contains_key(&base_site_id) {
        return Err(ApiError::InvalidBaseSiteId(base_site_id));
    }

    fn build(site_id: u64, lookup: &HashMap<u64, &Convertor>) -> SiteNode {
        let entry = lookup.get(&site_id).unwrap();
        let mut children = Vec::new();

        if let Some(order_str) = &entry.order {
            if let Ok(child_ids) = serde_json::from_str::<Vec<u64>>(order_str) {
                for child_id in child_ids {
                    if lookup.contains_key(&child_id) {
                        children.push(build(child_id, lookup));
                    }
                }
            }
        }

        SiteNode {
            site_id: entry.site_id,
            title: entry.site_title.clone(),
            reference_type: entry.reference_type.clone(),
            children,
        }
    }

    Ok(build(base_site_id, &lookup))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_folder_name() {
        assert_eq!(sanitize_folder_name("test/file"), "test_file");
        assert_eq!(sanitize_folder_name("a:b*c?d"), "a_b_c_d");
        assert_eq!(sanitize_folder_name("normal"), "normal");
    }

    #[test]
    fn test_build_tree_simple() {
        let convertors = vec![
            Convertor {
                site_id: 1,
                site_title: "Root".to_string(),
                reference_type: "Sites".to_string(),
                order: Some("[2, 3]".to_string()),
            },
            Convertor {
                site_id: 2,
                site_title: "Child1".to_string(),
                reference_type: "Results".to_string(),
                order: None,
            },
            Convertor {
                site_id: 3,
                site_title: "Child2".to_string(),
                reference_type: "Results".to_string(),
                order: None,
            },
        ];

        let tree = build_tree(&convertors, 1).unwrap();

        assert_eq!(tree.site_id, 1);
        assert_eq!(tree.title, "Root");
        assert_eq!(tree.children.len(), 2);
        assert_eq!(tree.children[0].site_id, 2);
        assert_eq!(tree.children[1].site_id, 3);
    }

    #[test]
    fn test_build_tree_invalid_base() {
        let convertors = vec![Convertor {
            site_id: 1,
            site_title: "Root".to_string(),
            reference_type: "Sites".to_string(),
            order: None,
        }];

        let result = build_tree(&convertors, 999);
        assert!(result.is_err());
    }
}
