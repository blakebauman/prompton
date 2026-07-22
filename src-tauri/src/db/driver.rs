use async_trait::async_trait;
use uuid::Uuid;

use crate::db::types::{SchemaNode, TableDescription};
use crate::error::AppResult;

#[derive(Debug, Clone)]
pub struct ExecResult {
    pub columns: Vec<(String, String)>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected_rows: Option<u64>,
    pub truncated: bool,
}

#[async_trait]
pub trait Driver: Send + Sync {
    async fn ping(&self) -> AppResult<()>;
    async fn list_schemas(&self) -> AppResult<Vec<SchemaNode>>;
    async fn describe_table(&self, schema: &str, table: &str) -> AppResult<TableDescription>;
    async fn sample_rows(
        &self,
        schema: &str,
        table: &str,
        limit: usize,
    ) -> AppResult<ExecResult>;
    async fn execute(&self, sql: &str, max_rows: usize) -> AppResult<ExecResult>;
    async fn explain(&self, sql: &str) -> AppResult<String>;
    #[allow(dead_code)]
    fn dialect_name(&self) -> &'static str;
    #[allow(dead_code)]
    fn connection_id(&self) -> Uuid;
}
