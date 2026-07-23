use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Dialect {
    Postgres,
    Mysql,
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
    /// When omitted: Postgres/MySQL default to production, SQLite to non-production.
    #[serde(default)]
    pub is_production: Option<bool>,
}

/// How long a staged write may wait for HITL before it is discarded.
pub const PENDING_WRITE_TTL_SECS: i64 = 10 * 60;

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
    /// When this write was staged (UTC).
    #[serde(default = "utc_now")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

fn utc_now() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

impl PendingWrite {
    pub fn is_expired(&self) -> bool {
        let age = chrono::Utc::now() - self.created_at;
        age > chrono::Duration::seconds(PENDING_WRITE_TTL_SECS)
    }
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

/// Hard cap on rows buffered for a single query result set.
pub const MAX_RESULT_ROWS: usize = 50_000;

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
    /// Present when `truncated` — the row cap that stopped the fetch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_cap: Option<usize>,
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

/// Strip comments and string/identifier literals so keyword scans ignore noise.
pub fn strip_sql_noise(sql: &str) -> String {
    let bytes = sql.as_bytes();
    let mut out = String::with_capacity(sql.len());
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        // SQL `--` line comment
        if c == '-' && i + 1 < bytes.len() && bytes[i + 1] == b'-' {
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            out.push(' ');
            continue;
        }
        // MySQL `#` line comment
        if c == '#' {
            i += 1;
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
        // MySQL backtick identifier
        if c == '`' {
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'`' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'`' {
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

/// Split a SQL script on `;` outside comments/strings.
pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let bytes = sql.as_bytes();
    let mut stmts = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c == '-' && i + 1 < bytes.len() && bytes[i + 1] == b'-' {
            cur.push(c);
            cur.push(bytes[i + 1] as char);
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' {
                cur.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }
        if c == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            cur.push(c);
            cur.push(bytes[i + 1] as char);
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                cur.push(bytes[i] as char);
                i += 1;
            }
            if i + 1 < bytes.len() {
                cur.push(bytes[i] as char);
                cur.push(bytes[i + 1] as char);
                i += 2;
            }
            continue;
        }
        if c == '\'' {
            cur.push(c);
            i += 1;
            while i < bytes.len() {
                cur.push(bytes[i] as char);
                if bytes[i] == b'\'' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                        cur.push(bytes[i + 1] as char);
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if c == '"' {
            cur.push(c);
            i += 1;
            while i < bytes.len() {
                cur.push(bytes[i] as char);
                if bytes[i] == b'"' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'"' {
                        cur.push(bytes[i + 1] as char);
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if c == ';' {
            let trimmed = cur.trim();
            if !trimmed.is_empty() {
                stmts.push(trimmed.to_string());
            }
            cur.clear();
            i += 1;
            continue;
        }
        cur.push(c);
        i += 1;
    }
    let trimmed = cur.trim();
    if !trimmed.is_empty() {
        stmts.push(trimmed.to_string());
    }
    stmts
}

fn sql_tokens(upper: &str) -> Vec<&str> {
    upper
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .filter(|t| !t.is_empty())
        .collect()
}

/// SQLite pragmas that are safe to treat as reads when not assigning.
const SAFE_READ_PRAGMAS: &[&str] = &[
    "TABLE_INFO",
    "TABLE_XINFO",
    "TABLE_LIST",
    "DATABASE_LIST",
    "FOREIGN_KEY_LIST",
    "INDEX_LIST",
    "INDEX_INFO",
    "INDEX_XINFO",
    "COMPILE_OPTIONS",
    "FUNCTION_LIST",
    "MODULE_LIST",
    "COLLATION_LIST",
    "DATA_VERSION",
    "SCHEMA_VERSION",
    "USER_VERSION",
    "FREELIST_COUNT",
    "PAGE_COUNT",
    "PAGE_SIZE",
    "ENCODING",
    "INTEGRITY_CHECK",
    "QUICK_CHECK",
];

fn statement_has_into_side_effect(tokens: &[&str]) -> bool {
    // Postgres `SELECT … INTO …` and MySQL `SELECT … INTO OUTFILE/DUMPFILE`.
    tokens.iter().any(|t| *t == "INTO")
}

fn is_mutating_statement(sql: &str) -> bool {
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

    // EXPLAIN ANALYZE executes the plan (may mutate); bare EXPLAIN does not.
    if first == "EXPLAIN" {
        return tokens.get(1).copied() == Some("ANALYZE");
    }

    if first == "PRAGMA" {
        let name = tokens.get(1).copied().unwrap_or("");
        let assigns = upper.contains('=');
        if SAFE_READ_PRAGMAS.contains(&name) && !assigns {
            return false;
        }
        // Assignments and unknown pragmas default to mutating.
        return true;
    }

    if first == "SELECT" || first == "VALUES" || first == "SHOW" || first == "DESCRIBE" || first == "DESC"
    {
        return statement_has_into_side_effect(&tokens);
    }

    if first == "WITH" {
        // CTE final verb may write; SELECT INTO inside a CTE is also mutating.
        return tokens.iter().any(|t| WRITE_KEYWORDS.contains(t))
            || statement_has_into_side_effect(&tokens);
    }

    // Unknown leading keywords → mutating (safe default).
    true
}

/// Host for Postgres/MySQL URLs — reject authority/query injection characters.
pub fn validate_db_host(host: &str) -> AppResult<&str> {
    let host = host.trim();
    if host.is_empty() {
        return Err(AppError::msg("Host is required"));
    }
    if host.len() > 253 {
        return Err(AppError::msg("Host is too long"));
    }
    if host.chars().any(|c| {
        matches!(c, '@' | '/' | '?' | '#' | '\\' | ' ' | '\t' | '\n' | '\r')
            || c.is_control()
    }) {
        return Err(AppError::msg("Invalid host"));
    }
    Ok(host)
}

/// Allowlisted Postgres `sslmode` values only.
pub fn validate_pg_ssl_mode(mode: &str) -> AppResult<&str> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full" => {
            Ok(mode.trim())
        }
        _ => Err(AppError::msg("Invalid ssl mode")),
    }
}

/// True when SQL may mutate data/schema or run transactional/admin side effects.
/// Safe default: unknown leading keywords are treated as mutating.
/// Closes CTE-write and `SELECT …; DELETE …` multi-statement bypasses.
pub fn is_mutating_sql(sql: &str) -> bool {
    let stmts = split_sql_statements(sql);
    if stmts.is_empty() {
        return false;
    }
    stmts.iter().any(|s| is_mutating_statement(s))
}

/// Statements that should return a row set (vs execute-only).
/// Intended for a single statement (callers should split scripts first).
pub fn is_row_returning_sql(sql: &str) -> bool {
    !is_mutating_statement(sql)
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
        assert!(!is_mutating_sql("# mysql comment\nSELECT 1"));
        assert!(!is_mutating_sql("SELECT * FROM t WHERE note = 'DELETE ALL'"));
        assert!(!is_mutating_sql("SELECT `delete` FROM t"));
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
    fn select_into_and_explain_analyze_are_mutating() {
        assert!(is_mutating_sql("SELECT * INTO new_t FROM old_t"));
        assert!(is_mutating_sql(
            "SELECT id, name INTO OUTFILE '/tmp/x.csv' FROM t"
        ));
        assert!(is_mutating_sql(
            "SELECT id INTO DUMPFILE '/tmp/x.bin' FROM t LIMIT 1"
        ));
        assert!(is_mutating_sql("EXPLAIN ANALYZE DELETE FROM t"));
        assert!(is_mutating_sql("EXPLAIN ANALYZE SELECT 1"));
        assert!(is_mutating_sql(
            "WITH x AS (SELECT 1 AS id) SELECT * INTO new_t FROM x"
        ));
        assert!(!is_mutating_sql("EXPLAIN SELECT 1"));
    }

    #[test]
    fn dangerous_pragmas_are_mutating() {
        assert!(is_mutating_sql("PRAGMA writable_schema=ON"));
        assert!(is_mutating_sql("PRAGMA journal_mode=WAL"));
        assert!(!is_mutating_sql("PRAGMA table_info(t)"));
        assert!(!is_mutating_sql("PRAGMA page_count"));
    }

    #[test]
    fn host_and_ssl_validation() {
        assert!(validate_db_host("localhost").is_ok());
        assert!(validate_db_host("127.0.0.1").is_ok());
        assert!(validate_db_host("db.example.com").is_ok());
        assert!(validate_db_host("evil@host").is_err());
        assert!(validate_db_host("host/path").is_err());
        assert!(validate_db_host("host?x=1").is_err());
        assert!(validate_pg_ssl_mode("prefer").is_ok());
        assert!(validate_pg_ssl_mode("verify-full").is_ok());
        assert!(validate_pg_ssl_mode("bogus").is_err());
        assert!(validate_pg_ssl_mode("require&inject=1").is_err());
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

    #[test]
    fn multi_statement_write_after_select_is_mutating() {
        assert!(is_mutating_sql("SELECT 1; DELETE FROM t"));
        assert!(is_mutating_sql(
            "SELECT * FROM t WHERE x = 'a;b'; DROP TABLE t"
        ));
        assert!(is_mutating_sql(
            "-- just a comment; with semicolon\nSELECT 1;\nINSERT INTO t VALUES (1)"
        ));
        assert!(!is_mutating_sql("SELECT 1; SELECT 2"));
        assert!(!is_mutating_sql("SELECT ';'; SELECT 2"));
    }

    #[test]
    fn split_respects_strings_and_comments() {
        let stmts = split_sql_statements(
            "SELECT ';'; -- ignored;\nSELECT 2 /* ; */ ; INSERT INTO t VALUES (1)",
        );
        assert_eq!(stmts.len(), 3);
        assert!(stmts[0].starts_with("SELECT"));
        assert!(stmts[1].contains("SELECT 2"));
        assert!(stmts[2].starts_with("INSERT"));
        // Semicolon inside the line comment must not create an extra statement.
        assert!(!stmts.iter().any(|s| s.trim() == "-- ignored"));
    }
}
