use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

const MAX_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HistoryKind {
    Query,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: Uuid,
    pub kind: HistoryKind,
    pub title: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conn_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conn_name: Option<String>,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordHistoryRequest {
    pub kind: HistoryKind,
    pub title: String,
    pub body: String,
    pub detail: Option<String>,
    pub conn_id: Option<Uuid>,
    pub conn_name: Option<String>,
    pub status: Option<String>,
    pub meta: Option<serde_json::Value>,
}

pub struct HistoryStore {
    path: PathBuf,
}

impl HistoryStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&data_dir);
        Self {
            path: data_dir.join("history.json"),
        }
    }

    fn load(&self) -> AppResult<Vec<HistoryEntry>> {
        if !self.path.exists() {
            return Ok(vec![]);
        }
        let raw = std::fs::read_to_string(&self.path)?;
        if raw.trim().is_empty() {
            return Ok(vec![]);
        }
        Ok(serde_json::from_str(&raw)?)
    }

    fn save(&self, entries: &[HistoryEntry]) -> AppResult<()> {
        let raw = serde_json::to_string_pretty(entries)?;
        std::fs::write(&self.path, raw)?;
        Ok(())
    }

    pub fn list(&self, limit: Option<usize>) -> AppResult<Vec<HistoryEntry>> {
        let mut entries = self.load()?;
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        if let Some(limit) = limit {
            entries.truncate(limit);
        }
        Ok(entries)
    }

    pub fn get(&self, id: Uuid) -> AppResult<Option<HistoryEntry>> {
        Ok(self.load()?.into_iter().find(|e| e.id == id))
    }

    pub fn record(&self, req: RecordHistoryRequest) -> AppResult<HistoryEntry> {
        let mut entries = self.load()?;
        let entry = HistoryEntry {
            id: Uuid::new_v4(),
            kind: req.kind,
            title: truncate(&req.title, 120),
            body: req.body,
            detail: req.detail.map(|d| truncate(&d, 8000)),
            conn_id: req.conn_id,
            conn_name: req.conn_name,
            status: req.status.unwrap_or_else(|| "ok".into()),
            meta: req.meta,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        entries.push(entry.clone());
        if entries.len() > MAX_ENTRIES {
            entries.sort_by(|a, b| a.created_at.cmp(&b.created_at));
            let drop = entries.len() - MAX_ENTRIES;
            entries.drain(0..drop);
        }
        self.save(&entries)?;
        Ok(entry)
    }

    pub fn record_query(
        &self,
        sql: &str,
        conn_id: Option<Uuid>,
        conn_name: Option<String>,
        total_rows: usize,
        duration_ms: u64,
        status: &str,
    ) -> AppResult<HistoryEntry> {
        let title = first_line(sql);
        self.record(RecordHistoryRequest {
            kind: HistoryKind::Query,
            title,
            body: sql.to_string(),
            detail: None,
            conn_id,
            conn_name,
            status: Some(status.into()),
            meta: Some(serde_json::json!({
                "totalRows": total_rows,
                "durationMs": duration_ms,
            })),
        })
    }

    pub fn delete(&self, id: Uuid) -> AppResult<()> {
        let mut entries = self.load()?;
        entries.retain(|e| e.id != id);
        self.save(&entries)
    }

    pub fn clear(&self) -> AppResult<()> {
        self.save(&[])
    }
}

fn first_line(sql: &str) -> String {
    let line = sql
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("Query");
    truncate(line, 120)
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::types::{ConnectRequest, Dialect, RunQueryRequest};
    use crate::db::ConnectionManager;

    #[test]
    fn record_list_delete_roundtrip() {
        let dir = std::env::temp_dir().join(format!("prompton-hist-{}", Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let store = HistoryStore::new(dir.clone());
        let entry = store
            .record_query(
                "SELECT 1 AS n",
                None,
                Some("local".into()),
                1,
                12,
                "ok",
            )
            .unwrap();
        let list = store.list(Some(10)).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, entry.id);
        assert_eq!(list[0].kind, HistoryKind::Query);
        assert!(list[0].title.contains("SELECT"));
        store.delete(entry.id).unwrap();
        assert!(store.list(None).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn query_then_history_matches_command_path() {
        let dir = std::env::temp_dir().join(format!("prompton-hist-q-{}", Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let mgr = ConnectionManager::new(dir.clone());
        let history = HistoryStore::new(dir.clone());
        let db_path = dir.join("t.db");
        let info = mgr
            .connect(ConnectRequest {
                name: "hist-demo".into(),
                dialect: Dialect::Sqlite,
                host: None,
                port: None,
                database: None,
                username: None,
                password: None,
                file_path: Some(db_path.display().to_string()),
                color: None,
                ssl_mode: None,
                is_production: Some(false),
            })
            .await
            .unwrap();
        mgr.run_query_trusted(RunQueryRequest {
            conn_id: info.id,
            sql: "CREATE TABLE t(id INTEGER); INSERT INTO t VALUES (1),(2),(3);".into(),
            page_size: 10,
        })
        .await
        .unwrap();
        let page = mgr
            .run_query(
                RunQueryRequest {
                    conn_id: info.id,
                    sql: "SELECT * FROM t".into(),
                    page_size: 10,
                },
                false,
            )
            .await
            .unwrap();
        // Mirror commands::run_query recording
        history
            .record_query(
                &page.sql,
                Some(info.id),
                Some(info.name.clone()),
                page.total_rows,
                page.duration_ms,
                "ok",
            )
            .unwrap();
        let list = history.list(Some(5)).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].body, "SELECT * FROM t");
        assert_eq!(list[0].conn_name.as_deref(), Some("hist-demo"));
        assert_eq!(
            list[0].meta.as_ref().and_then(|m| m.get("totalRows")).and_then(|v| v.as_u64()),
            Some(3)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
