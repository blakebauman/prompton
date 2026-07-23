use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Never ship raw driver/URL text to the webview.
        serializer.serialize_str(&self.public_message())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn msg(msg: impl Into<String>) -> Self {
        Self::Message(msg.into())
    }

    /// Stable, credential-safe message for UI / history / tool results.
    pub fn public_message(&self) -> String {
        match self {
            Self::Message(m) => m.clone(),
            Self::Sqlx(e) => public_sqlx_message(e),
            Self::Io(_) => "I/O error".into(),
            Self::Serde(_) => "Invalid data".into(),
            Self::Reqwest(_) => "Network request failed".into(),
            Self::Anyhow(_) => "Unexpected error".into(),
        }
    }
}

fn public_sqlx_message(e: &sqlx::Error) -> String {
    match e {
        sqlx::Error::Database(db) => {
            let msg = db.message();
            if looks_like_secret_leak(msg) {
                "Database error".into()
            } else {
                format!("Database error: {msg}")
            }
        }
        sqlx::Error::PoolClosed => "Connection pool closed".into(),
        sqlx::Error::PoolTimedOut => "Connection pool timed out".into(),
        sqlx::Error::Io(_) | sqlx::Error::Tls(_) => "Connection failed".into(),
        sqlx::Error::Protocol(_) => "Database protocol error".into(),
        sqlx::Error::Configuration(_) => "Invalid connection configuration".into(),
        sqlx::Error::RowNotFound => "Row not found".into(),
        sqlx::Error::ColumnNotFound(_) | sqlx::Error::ColumnDecode { .. } => {
            "Result decode error".into()
        }
        sqlx::Error::TypeNotFound { .. } => "Unknown database type".into(),
        other => {
            let raw = other.to_string();
            if looks_like_secret_leak(&raw) {
                "Database error".into()
            } else if raw.len() > 240 {
                "Database error".into()
            } else {
                format!("Database error: {raw}")
            }
        }
    }
}

fn looks_like_secret_leak(msg: &str) -> bool {
    let s = msg.to_ascii_lowercase();
    s.contains("password=")
        || s.contains("pwd=")
        || (s.contains("://") && s.contains('@'))
        || s.contains("postgres://")
        || s.contains("mysql://")
}

/// True when the error indicates the live DB session/pool is unusable.
pub fn is_connection_lost(err: &AppError) -> bool {
    match err {
        AppError::Sqlx(e) => match e {
            sqlx::Error::PoolClosed | sqlx::Error::PoolTimedOut => true,
            sqlx::Error::Io(_) | sqlx::Error::Tls(_) | sqlx::Error::Protocol(_) => true,
            sqlx::Error::Database(db) => {
                let code = db.code().map(|c| c.to_string()).unwrap_or_default();
                // Class 08 = connection exception; 57P0x = admin shutdown / crash
                code.starts_with("08")
                    || matches!(code.as_str(), "57P01" | "57P02" | "57P03")
            }
            other => looks_like_transport_failure(&other.to_string()),
        },
        AppError::Io(_) => true,
        AppError::Message(m) => {
            let s = m.to_ascii_lowercase();
            s.contains("connection lost")
                || s.contains("connection is not active")
                || looks_like_transport_failure(m)
        }
        other => looks_like_transport_failure(&other.to_string()),
    }
}

fn looks_like_transport_failure(msg: &str) -> bool {
    let s = msg.to_ascii_lowercase();
    s.contains("broken pipe")
        || s.contains("connection reset")
        || s.contains("connection refused")
        || s.contains("server closed the connection")
        || s.contains("connection closed")
        || s.contains("unexpected eof")
        || s.contains("network is unreachable")
        || s.contains("timed out") && s.contains("connect")
}

#[cfg(test)]
mod connection_lost_tests {
    use super::*;

    #[test]
    fn message_connection_lost() {
        assert!(is_connection_lost(&AppError::msg(
            "Connection lost (error). Reconnect to continue."
        )));
        assert!(is_connection_lost(&AppError::msg(
            "Connection is not active. Connect first."
        )));
        assert!(!is_connection_lost(&AppError::msg("syntax error near SELECT")));
    }

    #[test]
    fn transport_phrase_detection() {
        assert!(looks_like_transport_failure("broken pipe"));
        assert!(looks_like_transport_failure("server closed the connection unexpectedly"));
        assert!(!looks_like_transport_failure("unique constraint failed"));
    }

    #[test]
    fn public_message_scrubs_urlish_text() {
        let err = AppError::msg("ok");
        assert_eq!(err.public_message(), "ok");
        assert!(looks_like_secret_leak(
            "error connecting to postgres://user:secret@localhost/db"
        ));
        assert!(!looks_like_secret_leak("password authentication failed for user \"x\""));
    }
}
