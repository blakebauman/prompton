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
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn msg(msg: impl Into<String>) -> Self {
        Self::Message(msg.into())
    }
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
}
