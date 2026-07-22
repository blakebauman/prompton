use std::path::PathBuf;
use std::sync::Arc;

use crate::agent::AgentRuntime;
use crate::db::ConnectionManager;
use crate::history::HistoryStore;
use crate::prompts::PromptStore;
use crate::skills::SkillStore;

pub struct AppState {
    pub db: Arc<ConnectionManager>,
    pub agent: Arc<AgentRuntime>,
    pub skills: Arc<SkillStore>,
    pub prompts: Arc<PromptStore>,
    pub history: Arc<HistoryStore>,
    #[allow(dead_code)]
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&data_dir);
        Self {
            db: Arc::new(ConnectionManager::new(data_dir.clone())),
            agent: Arc::new(AgentRuntime::new(data_dir.clone())),
            skills: Arc::new(SkillStore::new(data_dir.clone())),
            prompts: Arc::new(PromptStore::new(data_dir.clone())),
            history: Arc::new(HistoryStore::new(data_dir.clone())),
            data_dir,
        }
    }
}
