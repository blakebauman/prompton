use async_trait::async_trait;
use futures::TryStreamExt;
use sqlx::mysql::{MySqlPoolOptions, MySqlRow};
use sqlx::{Column, MySql, Pool, Row, TypeInfo};
use uuid::Uuid;

use crate::db::driver::{Driver, ExecResult};
use crate::db::types::{
    validate_db_host, ColumnInfo, ConnectionConfig, SchemaNode, TableDescription,
};
use crate::error::{AppError, AppResult};

pub struct MysqlDriver {
    #[allow(dead_code)]
    id: Uuid,
    pool: Pool<MySql>,
}

impl MysqlDriver {
    pub async fn connect(config: &ConnectionConfig, password: &str) -> AppResult<Self> {
        let host = validate_db_host(config.host.as_deref().unwrap_or("localhost"))?;
        let port = config.port.unwrap_or(3306);
        let database = config.database.as_deref().unwrap_or("mysql");
        let username = config.username.as_deref().unwrap_or("root");
        let url = format!(
            "mysql://{}:{}@{}:{}/{}",
            urlencoding::encode(username),
            urlencoding::encode(password),
            host,
            port,
            urlencoding::encode(database),
        );
        let pool = MySqlPoolOptions::new()
            .max_connections(8)
            .connect(&url)
            .await?;
        Ok(Self {
            id: config.id,
            pool,
        })
    }

    fn quote_ident(name: &str) -> String {
        format!("`{}`", name.replace('`', "``"))
    }

    fn row_to_json(row: &MySqlRow) -> Vec<serde_json::Value> {
        (0..row.len())
            .map(|i| {
                let col = row.column(i);
                let type_name = col.type_info().name().to_ascii_uppercase();
                match type_name.as_str() {
                    "TINYINT" | "BOOLEAN" | "BOOL" => row
                        .try_get::<i8, _>(i)
                        .map(|v| serde_json::Value::Bool(v != 0))
                        .or_else(|_| {
                            row.try_get::<bool, _>(i)
                                .map(serde_json::Value::Bool)
                        })
                        .unwrap_or(serde_json::Value::Null),
                    "SMALLINT" | "MEDIUMINT" | "INT" | "INTEGER" => row
                        .try_get::<i32, _>(i)
                        .map(|v| serde_json::json!(v))
                        .unwrap_or(serde_json::Value::Null),
                    "BIGINT" => row
                        .try_get::<i64, _>(i)
                        .map(|v| serde_json::json!(v))
                        .unwrap_or(serde_json::Value::Null),
                    "FLOAT" | "DOUBLE" | "DECIMAL" | "NUMERIC" => row
                        .try_get::<f64, _>(i)
                        .map(|v| serde_json::json!(v))
                        .or_else(|_| {
                            row.try_get::<String, _>(i)
                                .map(serde_json::Value::String)
                        })
                        .unwrap_or(serde_json::Value::Null),
                    "JSON" => row
                        .try_get::<serde_json::Value, _>(i)
                        .unwrap_or(serde_json::Value::Null),
                    _ => row
                        .try_get::<String, _>(i)
                        .map(serde_json::Value::String)
                        .or_else(|_| {
                            row.try_get::<Vec<u8>, _>(i).map(|b| {
                                serde_json::Value::String(format!("\\x{}", hex_encode(&b)))
                            })
                        })
                        .unwrap_or(serde_json::Value::Null),
                }
            })
            .collect()
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[async_trait]
impl Driver for MysqlDriver {
    async fn ping(&self) -> AppResult<()> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    async fn list_schemas(&self) -> AppResult<Vec<SchemaNode>> {
        let schemas = sqlx::query_as::<_, (String,)>(
            "SELECT schema_name FROM information_schema.schemata
             WHERE schema_name NOT IN (
               'mysql', 'information_schema', 'performance_schema', 'sys'
             )
             ORDER BY schema_name",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut nodes = Vec::new();
        for (schema,) in schemas {
            let tables = sqlx::query_as::<_, (String, String)>(
                "SELECT table_name, table_type FROM information_schema.tables
                 WHERE table_schema = ?
                 ORDER BY table_name",
            )
            .bind(&schema)
            .fetch_all(&self.pool)
            .await?;

            let children = tables
                .into_iter()
                .map(|(name, kind)| SchemaNode {
                    name,
                    kind: if kind.to_ascii_uppercase().contains("VIEW") {
                        "view".into()
                    } else {
                        "table".into()
                    },
                    children: vec![],
                    data_type: None,
                    nullable: None,
                })
                .collect();

            nodes.push(SchemaNode {
                name: schema,
                kind: "schema".into(),
                children,
                data_type: None,
                nullable: None,
            });
        }
        Ok(nodes)
    }

    async fn describe_table(&self, schema: &str, table: &str) -> AppResult<TableDescription> {
        let cols = sqlx::query_as::<_, (String, String, String, Option<String>)>(
            "SELECT c.column_name, c.data_type, c.is_nullable,
                    (
                      SELECT 'YES' FROM information_schema.table_constraints tc
                      JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                       AND tc.table_schema = kcu.table_schema
                      WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = c.table_schema
                        AND tc.table_name = c.table_name
                        AND kcu.column_name = c.column_name
                      LIMIT 1
                    ) AS is_pk
             FROM information_schema.columns c
             WHERE c.table_schema = ? AND c.table_name = ?
             ORDER BY c.ordinal_position",
        )
        .bind(schema)
        .bind(table)
        .fetch_all(&self.pool)
        .await?;

        let estimated = sqlx::query_as::<_, (Option<i64>,)>(
            "SELECT table_rows FROM information_schema.tables
             WHERE table_schema = ? AND table_name = ?",
        )
        .bind(schema)
        .bind(table)
        .fetch_optional(&self.pool)
        .await?
        .and_then(|r| r.0);

        Ok(TableDescription {
            schema: schema.into(),
            table: table.into(),
            columns: cols
                .into_iter()
                .map(|(name, data_type, nullable, pk)| ColumnInfo {
                    name,
                    data_type,
                    nullable: nullable.eq_ignore_ascii_case("YES"),
                    is_primary_key: pk.as_deref() == Some("YES"),
                })
                .collect(),
            estimated_rows: estimated,
        })
    }

    async fn sample_rows(
        &self,
        schema: &str,
        table: &str,
        limit: usize,
    ) -> AppResult<ExecResult> {
        let sql = format!(
            "SELECT * FROM {}.{} LIMIT {}",
            Self::quote_ident(schema),
            Self::quote_ident(table),
            limit.min(100)
        );
        self.execute(&sql, limit.min(100)).await
    }

    async fn execute(&self, sql: &str, max_rows: usize) -> AppResult<ExecResult> {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Err(AppError::msg("Empty SQL"));
        }

        let is_select = crate::db::types::is_row_returning_sql(trimmed);

        if !is_select {
            let result = sqlx::query(trimmed).execute(&self.pool).await?;
            return Ok(ExecResult {
                columns: vec![],
                rows: vec![],
                affected_rows: Some(result.rows_affected()),
                truncated: false,
            });
        }

        let mut stream = sqlx::query(trimmed).fetch(&self.pool);
        let mut take: Vec<MySqlRow> = Vec::with_capacity(max_rows.min(1024));
        let mut truncated = false;
        while let Some(row) = stream.try_next().await? {
            if take.len() >= max_rows {
                truncated = true;
                break;
            }
            take.push(row);
        }
        drop(stream);

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
        let plan_sql = format!("EXPLAIN {sql}");
        let mut stream = sqlx::query(&plan_sql).fetch(&self.pool);
        let mut lines = Vec::new();
        while let Some(row) = stream.try_next().await? {
            let cols = (0..row.len())
                .map(|i| {
                    row.try_get::<String, _>(i)
                        .or_else(|_| {
                            row.try_get::<i64, _>(i).map(|n| n.to_string())
                        })
                        .unwrap_or_else(|_| "NULL".into())
                })
                .collect::<Vec<_>>()
                .join(" | ");
            lines.push(cols);
        }
        if lines.is_empty() {
            return Err(AppError::msg("EXPLAIN returned no rows"));
        }
        Ok(lines.join("\n"))
    }

    fn dialect_name(&self) -> &'static str {
        "mysql"
    }

    fn connection_id(&self) -> Uuid {
        self.id
    }
}
