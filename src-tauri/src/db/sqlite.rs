use async_trait::async_trait;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow};
use sqlx::{Column, ConnectOptions, Pool, Row, Sqlite, TypeInfo};
use std::str::FromStr;
use uuid::Uuid;

use crate::db::driver::{Driver, ExecResult};
use crate::db::types::{ColumnInfo, ConnectionConfig, SchemaNode, TableDescription};
use crate::error::{AppError, AppResult};

pub struct SqliteDriver {
    #[allow(dead_code)]
    id: Uuid,
    pool: Pool<Sqlite>,
}

impl SqliteDriver {
    pub async fn connect(config: &ConnectionConfig) -> AppResult<Self> {
        let path = config
            .file_path
            .as_deref()
            .ok_or_else(|| AppError::msg("SQLite file_path is required"))?;
        let options = SqliteConnectOptions::from_str(path)?
            .create_if_missing(true)
            .busy_timeout(std::time::Duration::from_secs(30))
            .disable_statement_logging();
        // Keep SQLite single-connection to avoid "database is locked" during
        // long writes (demo seed, migrations) across a multi-conn pool.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        Ok(Self {
            id: config.id,
            pool,
        })
    }

    fn row_to_json(row: &SqliteRow) -> Vec<serde_json::Value> {
        (0..row.len())
            .map(|i| {
                if let Ok(v) = row.try_get::<i64, _>(i) {
                    return serde_json::json!(v);
                }
                if let Ok(v) = row.try_get::<f64, _>(i) {
                    return serde_json::json!(v);
                }
                if let Ok(v) = row.try_get::<String, _>(i) {
                    return serde_json::Value::String(v);
                }
                if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                    return serde_json::Value::String(format!("blob({} bytes)", v.len()));
                }
                serde_json::Value::Null
            })
            .collect()
    }
}

#[async_trait]
impl Driver for SqliteDriver {
    async fn ping(&self) -> AppResult<()> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    async fn list_schemas(&self) -> AppResult<Vec<SchemaNode>> {
        let tables = sqlx::query_as::<_, (String, String)>(
            "SELECT name, type FROM sqlite_master
             WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;

        let children = tables
            .into_iter()
            .map(|(name, kind)| SchemaNode {
                name,
                kind,
                children: vec![],
                data_type: None,
                nullable: None,
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
        let pragma = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
        let cols = sqlx::query_as::<_, (i64, String, String, i64, Option<String>, i64)>(&pragma)
            .fetch_all(&self.pool)
            .await?;

        Ok(TableDescription {
            schema: "main".into(),
            table: table.into(),
            columns: cols
                .into_iter()
                .map(|(_cid, name, data_type, notnull, _default, pk)| ColumnInfo {
                    name,
                    data_type,
                    nullable: notnull == 0,
                    is_primary_key: pk > 0,
                })
                .collect(),
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

        let upper = trimmed.to_ascii_uppercase();
        let is_select = upper.starts_with("SELECT")
            || upper.starts_with("WITH")
            || upper.starts_with("PRAGMA")
            || upper.starts_with("EXPLAIN")
            || upper.starts_with("VALUES");

        if !is_select {
            let result = sqlx::query(trimmed).execute(&self.pool).await?;
            return Ok(ExecResult {
                columns: vec![],
                rows: vec![],
                affected_rows: Some(result.rows_affected()),
                truncated: false,
            });
        }

        let rows = sqlx::query(trimmed).fetch_all(&self.pool).await?;
        let truncated = rows.len() > max_rows;
        let take = rows.into_iter().take(max_rows).collect::<Vec<_>>();
        let columns = if let Some(first) = take.first() {
            first
                .columns()
                .iter()
                .map(|c| (c.name().to_string(), c.type_info().name().to_string()))
                .collect()
        } else {
            vec![]
        };
        let json_rows = take.iter().map(Self::row_to_json).collect();
        Ok(ExecResult {
            columns,
            rows: json_rows,
            affected_rows: None,
            truncated,
        })
    }

    async fn explain(&self, sql: &str) -> AppResult<String> {
        let plan_sql = format!("EXPLAIN QUERY PLAN {sql}");
        let rows = sqlx::query_as::<_, (i64, i64, i64, String)>(&plan_sql)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .into_iter()
            .map(|(_, _, _, detail)| detail)
            .collect::<Vec<_>>()
            .join("\n"))
    }

    fn dialect_name(&self) -> &'static str {
        "sqlite"
    }

    fn connection_id(&self) -> Uuid {
        self.id
    }
}
