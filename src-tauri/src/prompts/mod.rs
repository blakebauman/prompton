use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptEntry {
    pub id: Uuid,
    pub title: String,
    pub body: String,
    pub updated_at: String,
}

pub struct PromptStore {
    path: PathBuf,
}

impl PromptStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&data_dir);
        Self {
            path: data_dir.join("prompts.json"),
        }
    }

    fn load(&self) -> AppResult<Vec<PromptEntry>> {
        if !self.path.exists() {
            return Ok(vec![]);
        }
        let raw = std::fs::read_to_string(&self.path)?;
        Ok(serde_json::from_str(&raw)?)
    }

    fn save(&self, entries: &[PromptEntry]) -> AppResult<()> {
        let raw = serde_json::to_string_pretty(entries)?;
        std::fs::write(&self.path, raw)?;
        Ok(())
    }

    pub fn list(&self) -> AppResult<Vec<PromptEntry>> {
        self.load()
    }

    pub fn save_prompt(&self, id: Option<Uuid>, title: String, body: String) -> AppResult<PromptEntry> {
        let mut entries = self.load()?;
        let now = chrono::Utc::now().to_rfc3339();
        let entry = if let Some(id) = id {
            if let Some(existing) = entries.iter_mut().find(|e| e.id == id) {
                existing.title = title.clone();
                existing.body = body.clone();
                existing.updated_at = now.clone();
                existing.clone()
            } else {
                return Err(AppError::msg("Prompt not found"));
            }
        } else {
            let entry = PromptEntry {
                id: Uuid::new_v4(),
                title,
                body,
                updated_at: now,
            };
            entries.push(entry.clone());
            entry
        };
        self.save(&entries)?;
        Ok(entry)
    }

    pub fn delete(&self, id: Uuid) -> AppResult<()> {
        let mut entries = self.load()?;
        entries.retain(|e| e.id != id);
        self.save(&entries)
    }
}
