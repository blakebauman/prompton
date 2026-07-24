//! Cloudflare D1 driver — SQLite semantics over the Cloudflare REST API.
//!
//! Auth: API token (stored in OS keyring like other passwords).
//! Config mapping:
//! - `host` → Cloudflare account ID
//! - `database` → D1 database UUID
//!
//! Docs: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/

use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::db::driver::{Driver, ExecResult};
use crate::db::types::{ColumnInfo, ConnectionConfig, SchemaNode, TableDescription};
use crate::error::{AppError, AppResult};

const CF_API: &str = "https://api.cloudflare.com/client/v4";

pub struct D1Driver {
    id: Uuid,
    account_id: String,
    database_id: String,
    api_token: String,
    client: Client,
}

#[derive(Debug, Deserialize)]
struct CfEnvelope<T> {
    success: bool,
    errors: Vec<CfError>,
    #[serde(default)]
    result: T,
}

#[derive(Debug, Deserialize)]
struct CfError {
    #[allow(dead_code)]
    code: Option<i64>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueryResult {
    #[serde(default)]
    results: Vec<Value>,
    #[serde(default)]
    meta: QueryMeta,
    #[serde(default)]
    success: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
struct QueryMeta {
    changes: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct D1DatabaseInfo {
    pub uuid: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListedDatabase {
    uuid: Option<String>,
    name: Option<String>,
    created_at: Option<String>,
}

impl D1Driver {
    pub async fn connect(config: &ConnectionConfig, api_token: &str) -> AppResult<Self> {
        let account_id = config
            .host
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::msg("Cloudflare account ID is required"))?
            .to_string();
        let database_id = config
            .database
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::msg("D1 database UUID is required"))?
            .to_string();
        let token = api_token.trim();
        if token.is_empty() {
            return Err(AppError::msg("Cloudflare API token is required"));
        }

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| AppError::msg(format!("HTTP client error: {e}")))?;

        let driver = Self {
            id: config.id,
            account_id,
            database_id,
            api_token: token.to_string(),
            client,
        };
        driver.ping().await?;
        Ok(driver)
    }

    fn query_url(&self) -> String {
        format!(
            "{CF_API}/accounts/{}/d1/database/{}/query",
            self.account_id, self.database_id
        )
    }

    async fn query_raw(&self, sql: &str) -> AppResult<Vec<QueryResult>> {
        let body = serde_json::json!({ "sql": sql });
        let resp = self
            .client
            .post(self.query_url())
            .bearer_auth(&self.api_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::msg(format!("D1 request failed: {e}")))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| AppError::msg(format!("D1 response read failed: {e}")))?;

        let envelope: CfEnvelope<Vec<QueryResult>> = serde_json::from_str(&text).map_err(|_| {
            if !status.is_success() {
                AppError::msg(format!("D1 HTTP {status}"))
            } else {
                AppError::msg("Invalid D1 response")
            }
        })?;

        if !envelope.success {
            let msg = envelope
                .errors
                .iter()
                .filter_map(|e| e.message.clone())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(AppError::msg(if msg.is_empty() {
                "D1 query failed".into()
            } else {
                format!("D1 error: {msg}")
            }));
        }

        for part in &envelope.result {
            if part.success == Some(false) {
                return Err(AppError::msg("D1 statement failed"));
            }
        }

        Ok(envelope.result)
    }

    fn objects_to_exec(results: &[Value], max_rows: usize) -> ExecResult {
        if results.is_empty() {
            return ExecResult {
                columns: vec![],
                rows: vec![],
                affected_rows: None,
                truncated: false,
            };
        }

        let mut columns: Vec<(String, String)> = Vec::new();
        if let Some(Value::Object(first)) = results.first() {
            for key in first.keys() {
                columns.push((key.clone(), "TEXT".into()));
            }
        }

        let truncated = results.len() > max_rows;
        let take = results.iter().take(max_rows);
        let mut rows = Vec::new();
        for item in take {
            let Value::Object(map) = item else {
                continue;
            };
            let row: Vec<Value> = columns
                .iter()
                .map(|(name, _)| map.get(name).cloned().unwrap_or(Value::Null))
                .collect();
            rows.push(row);
        }

        ExecResult {
            columns,
            rows,
            affected_rows: None,
            truncated,
        }
    }
}

/// List D1 databases for an account (for the connect UI picker).
pub async fn list_databases(account_id: &str, api_token: &str) -> AppResult<Vec<D1DatabaseInfo>> {
    let account_id = account_id.trim();
    let api_token = api_token.trim();
    if account_id.is_empty() {
        return Err(AppError::msg("Cloudflare account ID is required"));
    }
    if api_token.is_empty() {
        return Err(AppError::msg("Cloudflare API token is required"));
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::msg(format!("HTTP client error: {e}")))?;

    let url = format!("{CF_API}/accounts/{account_id}/d1/database?per_page=100");
    let resp = client
        .get(url)
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| AppError::msg(format!("D1 list failed: {e}")))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::msg(format!("D1 response read failed: {e}")))?;

    let envelope: CfEnvelope<Vec<ListedDatabase>> = serde_json::from_str(&text).map_err(|_| {
        if !status.is_success() {
            AppError::msg(format!("D1 HTTP {status}"))
        } else {
            AppError::msg("Invalid D1 list response")
        }
    })?;

    if !envelope.success {
        let msg = envelope
            .errors
            .iter()
            .filter_map(|e| e.message.clone())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(AppError::msg(if msg.is_empty() {
            "Failed to list D1 databases".into()
        } else {
            format!("D1 error: {msg}")
        }));
    }

    Ok(envelope
        .result
        .into_iter()
        .filter_map(|db| {
            let uuid = db.uuid?;
            let name = db.name.unwrap_or_else(|| uuid.clone());
            Some(D1DatabaseInfo {
                uuid,
                name,
                created_at: db.created_at,
            })
        })
        .collect())
}

#[async_trait]
impl Driver for D1Driver {
    async fn ping(&self) -> AppResult<()> {
        self.query_raw("SELECT 1").await?;
        Ok(())
    }

    async fn list_schemas(&self) -> AppResult<Vec<SchemaNode>> {
        let parts = self
            .query_raw(
                "SELECT name, type FROM sqlite_master
                 WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
                 ORDER BY name",
            )
            .await?;
        let rows = parts
            .first()
            .map(|p| p.results.as_slice())
            .unwrap_or(&[]);

        let children = rows
            .iter()
            .filter_map(|v| {
                let obj = v.as_object()?;
                let name = obj.get("name")?.as_str()?.to_string();
                let kind = obj
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("table")
                    .to_string();
                Some(SchemaNode {
                    name,
                    kind,
                    children: vec![],
                    data_type: None,
                    nullable: None,
                })
            })
            .collect();

        Ok(vec![SchemaNode {
            name: "main".into(),
            kind: "schema".into(),
            children,
            data_type: None,
            nullable: None,
        }])
    }

    async fn describe_table(&self, _schema: &str, table: &str) -> AppResult<TableDescription> {
        let safe = table.replace('"', "\"\"");
        let pragma = format!("PRAGMA table_info(\"{safe}\")");
        let parts = self.query_raw(&pragma).await?;
        let rows = parts
            .first()
            .map(|p| p.results.as_slice())
            .unwrap_or(&[]);

        let columns = rows
            .iter()
            .filter_map(|v| {
                let obj = v.as_object()?;
                let name = obj.get("name")?.as_str()?.to_string();
                let data_type = obj
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("TEXT")
                    .to_string();
                let notnull = obj.get("notnull").and_then(|n| n.as_i64()).unwrap_or(0);
                let pk = obj.get("pk").and_then(|n| n.as_i64()).unwrap_or(0);
                Some(ColumnInfo {
                    name,
                    data_type,
                    nullable: notnull == 0,
                    is_primary_key: pk > 0,
                })
            })
            .collect();

        Ok(TableDescription {
            schema: "main".into(),
            table: table.into(),
            columns,
            estimated_rows: None,
        })
    }

    async fn sample_rows(
        &self,
        _schema: &str,
        table: &str,
        limit: usize,
    ) -> AppResult<ExecResult> {
        let sql = format!(
            "SELECT * FROM \"{}\" LIMIT {}",
            table.replace('"', "\"\""),
            limit.min(100)
        );
        self.execute(&sql, limit.min(100)).await
    }

    async fn execute(&self, sql: &str, max_rows: usize) -> AppResult<ExecResult> {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Err(AppError::msg("Empty SQL"));
        }

        let parts = self.query_raw(trimmed).await?;
        let is_select = crate::db::types::is_row_returning_sql(trimmed);

        if !is_select {
            let changes = parts
                .iter()
                .map(|p| p.meta.changes.unwrap_or(0.0) as u64)
                .sum::<u64>();
            return Ok(ExecResult {
                columns: vec![],
                rows: vec![],
                affected_rows: Some(changes),
                truncated: false,
            });
        }

        // Multi-statement batches: use the last result set with rows.
        let mut best: Option<&[Value]> = None;
        for part in &parts {
            if !part.results.is_empty() {
                best = Some(part.results.as_slice());
            }
        }
        Ok(Self::objects_to_exec(best.unwrap_or(&[]), max_rows))
    }

    async fn explain(&self, sql: &str) -> AppResult<String> {
        let plan_sql = format!("EXPLAIN QUERY PLAN {sql}");
        let parts = self.query_raw(&plan_sql).await?;
        let rows = parts
            .first()
            .map(|p| p.results.as_slice())
            .unwrap_or(&[]);

        let lines: Vec<String> = rows
            .iter()
            .filter_map(|v| {
                let obj = v.as_object()?;
                obj.get("detail")
                    .and_then(|d| d.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(v.to_string()))
            })
            .collect();
        Ok(lines.join("\n"))
    }

    fn dialect_name(&self) -> &'static str {
        "d1"
    }

    fn connection_id(&self) -> Uuid {
        self.id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn objects_to_grid() {
        let rows = vec![
            serde_json::json!({"id": 1, "name": "a"}),
            serde_json::json!({"id": 2, "name": "b"}),
            serde_json::json!({"id": 3, "name": "c"}),
        ];
        let exec = D1Driver::objects_to_exec(&rows, 2);
        assert_eq!(exec.columns.len(), 2);
        assert_eq!(exec.rows.len(), 2);
        assert!(exec.truncated);
        assert_eq!(exec.rows[0][0], serde_json::json!(1));
    }
}
