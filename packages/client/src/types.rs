use serde::{Deserialize, Serialize};

/// Pleasanter サーバーへの接続情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    /// サーバーの URL（例: "https://pleasanter.example.com"）
    pub base_url: String,
    /// API キー
    pub api_key: String,
    /// API バージョン（例: "1.1"）
    pub api_version: String,
}
