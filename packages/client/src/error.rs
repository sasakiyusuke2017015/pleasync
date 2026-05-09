use std::io;

use thiserror::Error;

/// API エラー
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("サイト {site_id} - HTTP {status_code}: {message}")]
    HttpError {
        site_id: u64,
        status_code: u16,
        message: String,
    },

    #[error("サイト {site_id} への接続に失敗: {message}")]
    RequestError {
        site_id: u64,
        message: String,
    },

    #[error("無効な BaseSiteId: {0}")]
    InvalidBaseSiteId(u64),

    #[error("IO エラー: {0}")]
    IoError(#[from] io::Error),

    #[error("JSON パースエラー: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("サイトパッケージエラー: {0}")]
    PackageError(String),
}
