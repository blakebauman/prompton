use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::agent::providers::ProviderConfig;
use crate::agent::{AgentChatRequest, AgentSettings, PendingConfirmation};
use crate::db::types::{
    ConnectRequest, ConnectionInfo, PendingWrite, QueryPage, RunQueryRequest, SchemaNode,
    TableDescription,
};
use crate::error::AppResult;
use crate::history::{HistoryEntry, HistoryListFilter, RecordHistoryRequest};
use crate::prompts::PromptEntry;
use crate::skills::{SkillContent, SkillMeta};
use crate::state::AppState;

#[tauri::command]
pub fn list_connections(state: State<'_, AppState>) -> Vec<ConnectionInfo> {
    state.db.list()
}

#[tauri::command]
pub async fn connect_db(
    state: State<'_, AppState>,
    request: ConnectRequest,
) -> AppResult<ConnectionInfo> {
    state.db.connect(request).await
}

#[tauri::command]
pub async fn reconnect_db(state: State<'_, AppState>, id: Uuid) -> AppResult<ConnectionInfo> {
    state.db.reconnect(id).await
}

#[tauri::command]
pub async fn ping_db(state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.db.ping(id).await
}

#[tauri::command]
pub fn disconnect_db(state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.db.disconnect(id)
}

#[tauri::command]
pub fn remove_connection(state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.db.remove(id)
}

#[tauri::command]
pub async fn list_schemas(state: State<'_, AppState>, id: Uuid) -> AppResult<Vec<SchemaNode>> {
    state.db.list_schemas(id).await
}

#[tauri::command]
pub async fn describe_table(
    state: State<'_, AppState>,
    id: Uuid,
    schema: String,
    table: String,
) -> AppResult<TableDescription> {
    state.db.describe_table(id, schema, table).await
}

#[tauri::command]
pub async fn run_query(
    app: AppHandle,
    state: State<'_, AppState>,
    request: RunQueryRequest,
    allow_mutating: Option<bool>,
) -> AppResult<QueryPage> {
    // allow_mutating is ignored: all mutations must go through HITL confirm_write.
    let _ = allow_mutating;
    let conn_name = state
        .db
        .get_config(request.conn_id)
        .map(|c| c.name.clone());
    match state.db.run_query(request.clone(), false).await {
        Ok(page) => {
            let _ = state.history.record_query(
                &page.sql,
                Some(request.conn_id),
                conn_name,
                page.total_rows,
                page.duration_ms,
                "ok",
            );
            let _ = app.emit("history:updated", ());
            Ok(page)
        }
        Err(e) => {
            let msg = e.to_string();
            let cancelled = msg.to_ascii_lowercase().contains("cancel");
            if !cancelled {
                let _ = state.history.record_query_detailed(
                    &request.sql,
                    Some(request.conn_id),
                    conn_name,
                    0,
                    0,
                    "error",
                    Some(msg),
                );
                let _ = app.emit("history:updated", ());
            }
            Err(e)
        }
    }
}

#[tauri::command]
pub fn request_write_approval(
    state: State<'_, AppState>,
    conn_id: Uuid,
    sql: String,
    session_id: Option<Uuid>,
) -> AppResult<PendingWrite> {
    state
        .db
        .request_write_approval(conn_id, sql, session_id)
}

#[tauri::command]
pub async fn confirm_write(
    app: AppHandle,
    state: State<'_, AppState>,
    confirmation_id: Uuid,
    approved: bool,
    query_id: Option<Uuid>,
) -> AppResult<Option<QueryPage>> {
    let page = state
        .db
        .confirm_write(confirmation_id, approved, query_id)
        .await?;
    if let Some(ref page) = page {
        let conn_id = state.db.query_conn_id(page.query_id);
        let conn_name = conn_id.and_then(|id| state.db.get_config(id).map(|c| c.name.clone()));
        let _ = state.history.record_query(
            &page.sql,
            conn_id,
            conn_name,
            page.total_rows,
            page.duration_ms,
            "ok",
        );
        let _ = app.emit("history:updated", ());
    }
    Ok(page)
}

#[tauri::command]
pub fn set_connection_production(
    state: State<'_, AppState>,
    id: Uuid,
    is_production: bool,
) -> AppResult<ConnectionInfo> {
    state.db.set_production(id, is_production)
}

#[tauri::command]
pub fn set_admin_writes_unlocked(
    state: State<'_, AppState>,
    id: Uuid,
    unlocked: bool,
) -> AppResult<ConnectionInfo> {
    state.db.set_admin_writes_unlocked(id, unlocked)
}

#[tauri::command]
pub fn cancel_query(state: State<'_, AppState>, query_id: Uuid) -> AppResult<()> {
    state.db.cancel_query(query_id)
}

#[tauri::command]
pub fn fetch_query_page(
    state: State<'_, AppState>,
    query_id: Uuid,
    offset: usize,
    limit: usize,
) -> AppResult<QueryPage> {
    state.db.fetch_page(query_id, offset, limit)
}

#[tauri::command]
pub async fn explain_query(
    state: State<'_, AppState>,
    conn_id: Uuid,
    sql: String,
) -> AppResult<String> {
    state.db.explain(conn_id, sql).await
}

#[tauri::command]
pub async fn agent_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    request: AgentChatRequest,
) -> AppResult<Uuid> {
    let db = Arc::clone(&state.db);
    let skills = Arc::clone(&state.skills);
    let prompts = Arc::clone(&state.prompts);
    state.agent.chat(app, db, skills, prompts, request).await
}

#[tauri::command]
pub fn agent_cancel(state: State<'_, AppState>, session_id: Uuid) {
    state.agent.cancel(session_id);
}

#[tauri::command]
pub async fn agent_confirm(
    app: AppHandle,
    state: State<'_, AppState>,
    confirmation_id: Uuid,
    approved: bool,
) -> AppResult<()> {
    let db = Arc::clone(&state.db);
    let skills = Arc::clone(&state.skills);
    let prompts = Arc::clone(&state.prompts);
    state
        .agent
        .confirm_and_run(app, db, skills, prompts, confirmation_id, approved)
        .await
}

#[tauri::command]
pub async fn agent_get_settings(state: State<'_, AppState>) -> AppResult<AgentSettings> {
    state.agent.ensure_ollama_model().await
}

#[tauri::command]
pub fn agent_set_settings(
    state: State<'_, AppState>,
    settings: AgentSettings,
    api_key: Option<String>,
) -> AppResult<()> {
    state.agent.set_settings(settings, api_key)
}

#[tauri::command]
pub fn agent_last_context(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> Option<crate::agent::budgeter::BudgetReport> {
    state.agent.last_context(session_id)
}

#[tauri::command]
pub async fn list_ollama_models(
    base_url: Option<String>,
) -> AppResult<Vec<crate::agent::ollama::LocalModel>> {
    let base = base_url.unwrap_or_else(|| "http://127.0.0.1:11434/v1".into());
    crate::agent::ollama::list_ollama_models(&base).await
}

#[tauri::command]
pub fn list_skills(state: State<'_, AppState>) -> AppResult<Vec<SkillMeta>> {
    state.skills.list()
}

#[tauri::command]
pub fn get_skill(state: State<'_, AppState>, name: String) -> AppResult<SkillContent> {
    state.skills.get(&name)
}

#[tauri::command]
pub fn save_skill(
    state: State<'_, AppState>,
    name: String,
    description: String,
    body: String,
) -> AppResult<SkillContent> {
    state.skills.save(&name, &description, &body)
}

#[tauri::command]
pub fn list_prompts(state: State<'_, AppState>) -> AppResult<Vec<PromptEntry>> {
    state.prompts.list()
}

#[tauri::command]
pub fn save_prompt(
    state: State<'_, AppState>,
    id: Option<Uuid>,
    title: String,
    body: String,
) -> AppResult<PromptEntry> {
    state.prompts.save_prompt(id, title, body)
}

#[tauri::command]
pub fn delete_prompt(state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.prompts.delete(id)
}

#[tauri::command]
pub fn list_history(
    state: State<'_, AppState>,
    filter: Option<HistoryListFilter>,
    limit: Option<usize>,
) -> AppResult<Vec<HistoryEntry>> {
    let mut filter = filter.unwrap_or_default();
    if filter.limit.is_none() {
        filter.limit = limit.or(Some(200));
    }
    state.history.list_filtered(filter)
}

#[tauri::command]
pub fn get_history(
    state: State<'_, AppState>,
    id: Uuid,
) -> AppResult<Option<HistoryEntry>> {
    state.history.get(id)
}

#[tauri::command]
pub fn record_history(
    app: AppHandle,
    state: State<'_, AppState>,
    request: RecordHistoryRequest,
) -> AppResult<HistoryEntry> {
    let entry = state.history.record(request)?;
    let _ = app.emit("history:updated", ());
    Ok(entry)
}

#[tauri::command]
pub fn delete_history(app: AppHandle, state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.history.delete(id)?;
    let _ = app.emit("history:updated", ());
    Ok(())
}

#[tauri::command]
pub fn clear_history(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.history.clear()?;
    let _ = app.emit("history:updated", ());
    Ok(())
}

#[tauri::command]
pub fn get_provider_kinds() -> Vec<&'static str> {
    vec!["openaiCompatible", "anthropic", "ollama"]
}

#[tauri::command]
pub fn default_provider_config(kind: String) -> ProviderConfig {
    match kind.as_str() {
        "anthropic" => ProviderConfig {
            kind: crate::agent::providers::ProviderKind::Anthropic,
            model: "claude-sonnet-4-20250514".into(),
            base_url: Some("https://api.anthropic.com".into()),
        },
        "ollama" => ProviderConfig {
            kind: crate::agent::providers::ProviderKind::Ollama,
            model: "qwen2.5-coder:14b".into(),
            base_url: Some("http://127.0.0.1:11434/v1".into()),
        },
        _ => ProviderConfig {
            kind: crate::agent::providers::ProviderKind::OpenAiCompatible,
            model: "gpt-4o-mini".into(),
            base_url: Some("https://api.openai.com/v1".into()),
        },
    }
}

#[tauri::command]
pub async fn open_demo_sqlite(
    state: State<'_, AppState>,
) -> AppResult<(ConnectionInfo, QueryPage)> {
    state.db.open_demo_sqlite().await
}

#[tauri::command]
pub fn app_data_dir(app: AppHandle) -> AppResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::msg(e.to_string()))?;
    Ok(dir.display().to_string())
}

// silence unused import warning for PendingConfirmation in some builds
#[allow(dead_code)]
fn _pending_type(_: PendingConfirmation) {}
