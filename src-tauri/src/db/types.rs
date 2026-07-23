use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Dialect {
    Postgres,
    Sqlite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: Uuid,
    pub name: String,
    pub dialect: Dialect,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub file_path: Option<String>,
    pub color: String,
    #[serde(default)]
    pub ssl_mode: Option<String>,
    /// Production connections stay read-only until HITL approves each write.
    #[serde(default)]
    pub is_production: bool,
    /// Admin override: unlock writes on a production connection.
    /// Mutations still require per-statement HITL approval.
    #[serde(default)]
    pub admin_writes_unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: Uuid,
    pub name: String,
    pub dialect: Dialect,
    pub color: String,
    pub connected: bool,
    pub summary: String,
    #[serde(default)]
    pub is_production: bool,
    #[serde(default)]
    pub admin_writes_unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub name: String,
    pub dialect: Dialect,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub file_path: Option<String>,
    pub color: Option<String>,
    pub ssl_mode: Option<String>,
    /// When omitted: Postgres defaults to production, SQLite to non-production.
    #[serde(default)]
    pub is_production: Option<bool>,
}

/// A write that is staged until a human approves or rejects it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingWrite {
    pub confirmation_id: Uuid,
    pub conn_id: Uuid,
    pub sql: String,
    pub reason: String,
    pub is_production: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<Uuid>,
    /// True when an admin has unlocked writes on this production connection.
    #[serde(default)]
    pub admin_writes_unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaNode {
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub children: Vec<SchemaNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nullable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDescription {
    pub schema: String,
    pub table: String,
    pub columns: Vec<ColumnInfo>,
    pub estimated_rows: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryColumn {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPage {
    pub query_id: Uuid,
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub offset: usize,
    pub limit: usize,
    pub total_rows: usize,
    pub truncated: bool,
    pub affected_rows: Option<u64>,
    pub duration_ms: u64,
    pub sql: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunQueryRequest {
    pub conn_id: Uuid,
    pub sql: String,
    #[serde(default = "default_page_size")]
    pub page_size: usize,
    /// Client-supplied id so Cancel can target an in-flight run before it completes.
    #[serde(default)]
    pub query_id: Option<Uuid>,
}

fn default_page_size() -> usize {
    500
}

const WRITE_KEYWORDS: &[&str] = &[
    "INSERT", "UPDATE", "DELETE", "REPLACE", "MERGE", "UPSERT", "CREATE", "DROP",
    "ALTER", "TRUNCATE", "GRANT", "REVOKE", "COPY", "CALL", "DO", "VACUUM", "REINDEX",
    "ATTACH", "DETACH", "REFRESH", "COMMENT", "SECURITY", "SET", "RESET", "BEGIN",
    "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE", "LOCK", "UNLOCK",
];

const READ_KEYWORDS: &[&str] = &[
    "SELECT", "SHOW", "EXPLAIN", "DESCRIBE", "DESC", "PRAGMA", "VALUES", "WITH",
];

/// Strip comments and string/identifier literals so keyword scans ignore noise.
pub fn strip_sql_noise(sql: &str) -> String {
    let bytes = sql.as_bytes();
    let mut out = String::with_capacity(sql.len());
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        // Line comment
        if c == '-' && i + 1 < bytes.len() && bytes[i + 1] == b'-' {
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            out.push(' ');
            continue;
        }
        // Block comment
        if c == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            out.push(' ');
            continue;
        }
        // Single-quoted string
        if c == '\'' {
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\'' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            out.push(' ');
            continue;
        }
        // Double-quoted identifier / string
        if c == '"' {
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'"' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'"' {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            out.push(' ');
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

fn sql_tokens(upper: &str) -> Vec<&str> {
    upper
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .filter(|t| !t.is_empty())
        .collect()
}

/// True when SQL may mutate data/schema or run transactional/admin side effects.
/// Safe default: unknown leading keywords are treated as mutating.
/// `WITH … INSERT/UPDATE/DELETE` is detected (CTE write bypass closed).
pub fn is_mutating_sql(sql: &str) -> bool {
    let clean = strip_sql_noise(sql);
    let upper = clean.trim().to_ascii_uppercase();
    if upper.is_empty() {
        return false;
    }
    let tokens = sql_tokens(&upper);
    let first = tokens.first().copied().unwrap_or("");

    if WRITE_KEYWORDS.contains(&first) {
        return true;
    }
    if READ_KEYWORDS.contains(&first) && first != "WITH" {
        return false;
    }
    if first == "WITH" {
        // Any write keyword in the statement (including final CTE verb) ⇒ mutating.
        return tokens.iter().any(|t| WRITE_KEYWORDS.contains(t));
    }
    true
}

/// Statements that should return a row set (vs execute-only).
pub fn is_row_returning_sql(sql: &str) -> bool {
    !is_mutating_sql(sql)
}

#[cfg(test)]
mod sql_classify_tests {
    use super::*;

    #[test]
    fn reads_are_non_mutating() {
        assert!(!is_mutating_sql("SELECT 1"));
        assert!(!is_mutating_sql("  select * from t"));
        assert!(!is_mutating_sql("WITH x AS (SELECT 1) SELECT * FROM x"));
        assert!(!is_mutating_sql("EXPLAIN SELECT 1"));
        assert!(!is_mutating_sql("PRAGMA table_info(t)"));
        assert!(!is_mutating_sql("-- comment\nSELECT 1"));
        assert!(!is_mutating_sql("SELECT * FROM t WHERE note = 'DELETE ALL'"));
    }

    #[test]
    fn writes_are_mutating() {
        assert!(is_mutating_sql("INSERT INTO t VALUES (1)"));
        assert!(is_mutating_sql("UPDATE t SET x = 1"));
        assert!(is_mutating_sql("DELETE FROM t"));
        assert!(is_mutating_sql("DROP TABLE t"));
        assert!(is_mutating_sql("CREATE TABLE t(id INT)"));
        assert!(is_mutating_sql("TRUNCATE t"));
    }

    #[test]
    fn cte_writes_are_mutating() {
        assert!(is_mutating_sql(
            "WITH x AS (SELECT 1 AS id) INSERT INTO t SELECT * FROM x"
        ));
        assert!(is_mutating_sql(
            "WITH x AS (SELECT id FROM t) UPDATE t SET v = 1 WHERE id IN (SELECT id FROM x)"
        ));
        assert!(is_mutating_sql(
            "WITH x AS (SELECT id FROM t) DELETE FROM t WHERE id IN (SELECT id FROM x)"
        ));
        assert!(is_mutating_sql(
            "/* lead */ WITH x AS (SELECT 1) INSERT INTO t VALUES (1)"
        ));
    }

    #[test]
    fn unknown_leading_keyword_is_mutating() {
        assert!(is_mutating_sql("CLUSTER t"));
    }
}
