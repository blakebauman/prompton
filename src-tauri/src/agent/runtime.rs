use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::agent::budgeter::{BudgetReport, ContextBudget, ContextBudgeter};
use crate::agent::providers::{
    ChatMessage, HttpLlmProvider, LlmProvider, ProviderConfig, ProviderKind, ToolCall, ToolSpec,
};
use crate::db::types::{RunQueryRequest, is_mutating_sql};
use crate::db::ConnectionManager;
use crate::error::{AppError, AppResult};
use crate::prompts::PromptStore;
use crate::secrets::SecretStore;
use crate::skills::SkillStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    pub provider: ProviderConfig,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider: ProviderConfig {
                kind: ProviderKind::Ollama,
                // Resolved against installed Ollama models on first use / settings open.
                model: "qwen2.5-coder:14b".into(),
                base_url: Some("http://127.0.0.1:11434/v1".into()),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatRequest {
    pub session_id: Option<Uuid>,
    pub conn_id: Uuid,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingConfirmation {
    pub confirmation_id: Uuid,
    pub session_id: Uuid,
    pub conn_id: Uuid,
    pub sql: String,
    pub reason: String,
    pub is_production: bool,
    #[serde(default)]
    pub admin_writes_unlocked: bool,
}

struct Session {
    #[allow(dead_code)]
    id: Uuid,
    conn_id: Uuid,
    messages: Vec<ChatMessage>,
    last_context: BudgetReport,
    cancel: CancellationToken,
}

pub struct AgentRuntime {
    sessions: RwLock<HashMap<Uuid, Session>>,
    settings: RwLock<AgentSettings>,
    pending: RwLock<HashMap<Uuid, PendingConfirmation>>,
    budgeter: ContextBudgeter,
    secrets: SecretStore,
    settings_path: std::path::PathBuf,
}

impl AgentRuntime {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        let settings_path = data_dir.join("agent_settings.json");
        let settings = if settings_path.exists() {
            std::fs::read_to_string(&settings_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            AgentSettings::default()
        };
        Self {
            sessions: RwLock::new(HashMap::new()),
            settings: RwLock::new(settings),
            pending: RwLock::new(HashMap::new()),
            budgeter: ContextBudgeter::new(ContextBudget::default()),
            secrets: SecretStore::new("dev.prompton.desktop"),
            settings_path,
        }
    }

    pub fn get_settings(&self) -> AgentSettings {
        self.settings.read().clone()
    }

    /// If Ollama is selected and the configured model is missing, pick an installed one.
    pub async fn ensure_ollama_model(&self) -> AppResult<AgentSettings> {
        let settings = self.get_settings();
        if settings.provider.kind != ProviderKind::Ollama {
            return Ok(settings);
        }
        let base = settings
            .provider
            .base_url
            .clone()
            .unwrap_or_else(|| "http://127.0.0.1:11434/v1".into());
        let models = match crate::agent::ollama::list_ollama_models(&base).await {
            Ok(m) => m,
            Err(_) => return Ok(settings),
        };
        if models.is_empty() {
            return Ok(settings);
        }
        let current_ok = models.iter().any(|m| m.name == settings.provider.model);
        if current_ok {
            return Ok(settings);
        }
        let Some(picked) = crate::agent::ollama::pick_default_model(&models) else {
            return Ok(settings);
        };
        let mut next = settings;
        next.provider.model = picked;
        self.set_settings(next.clone(), None)?;
        Ok(next)
    }

    pub fn set_settings(&self, settings: AgentSettings, api_key: Option<String>) -> AppResult<()> {
        if let Some(key) = api_key {
            let provider = match settings.provider.kind {
                ProviderKind::Anthropic => "anthropic",
                ProviderKind::Ollama => "ollama",
                ProviderKind::OpenAiCompatible => "openai",
            };
            if !key.is_empty() {
                self.secrets.set_api_key(provider, &key)?;
            }
        }
        *self.settings.write() = settings.clone();
        let raw = serde_json::to_string_pretty(&settings)?;
        if let Some(parent) = self.settings_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.settings_path, raw)?;
        Ok(())
    }

    pub fn last_context(&self, session_id: Uuid) -> Option<BudgetReport> {
        self.sessions
            .read()
            .get(&session_id)
            .map(|s| s.last_context.clone())
    }

    pub fn cancel(&self, session_id: Uuid) {
        if let Some(s) = self.sessions.write().get_mut(&session_id) {
            s.cancel.cancel();
            s.cancel = CancellationToken::new();
        }
    }

    fn tool_specs() -> Vec<ToolSpec> {
        vec![
            ToolSpec {
                name: "inspect_schema".into(),
                description: "List schemas/tables or describe a table. Prefer summaries.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "schema": {"type": "string"},
                        "table": {"type": "string"}
                    }
                }),
            },
            ToolSpec {
                name: "sample_rows".into(),
                description: "Fetch a small sample of rows from a table.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "schema": {"type": "string"},
                        "table": {"type": "string"},
                        "limit": {"type": "integer"}
                    },
                    "required": ["table"]
                }),
            },
            ToolSpec {
                name: "explain_query".into(),
                description: "Run EXPLAIN on a SQL statement.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "sql": {"type": "string"}
                    },
                    "required": ["sql"]
                }),
            },
            ToolSpec {
                name: "run_query".into(),
                description: "Run SQL. Read-only by default; mutating SQL is staged and blocked until human-in-the-loop approval (required for production).".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "sql": {"type": "string"}
                    },
                    "required": ["sql"]
                }),
            },
            ToolSpec {
                name: "list_skills".into(),
                description: "List available agent skills.".into(),
                parameters: json!({"type": "object", "properties": {}}),
            },
            ToolSpec {
                name: "save_skill".into(),
                description: "Save or update a skill as SKILL.md.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "body": {"type": "string"}
                    },
                    "required": ["name", "description", "body"]
                }),
            },
            ToolSpec {
                name: "list_prompts".into(),
                description: "List saved prompts from the prompt library.".into(),
                parameters: json!({"type": "object", "properties": {}}),
            },
            ToolSpec {
                name: "save_prompt".into(),
                description: "Save a prompt into the library.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "body": {"type": "string"}
                    },
                    "required": ["title", "body"]
                }),
            },
        ]
    }

    fn provider(&self) -> AppResult<HttpLlmProvider> {
        let settings = self.settings.read().clone();
        let provider_name = match settings.provider.kind {
            ProviderKind::Anthropic => "anthropic",
            ProviderKind::Ollama => "ollama",
            ProviderKind::OpenAiCompatible => "openai",
        };
        let api_key = self.secrets.get_api_key(provider_name)?;
        Ok(HttpLlmProvider::new(settings.provider, api_key))
    }

    pub async fn chat(
        &self,
        app: AppHandle,
        db: Arc<ConnectionManager>,
        skills: Arc<SkillStore>,
        prompts: Arc<PromptStore>,
        req: AgentChatRequest,
    ) -> AppResult<Uuid> {
        let session_id = req.session_id.unwrap_or_else(Uuid::new_v4);
        let skill_blurb = skills
            .list()
            .unwrap_or_default()
            .into_iter()
            .map(|s| format!("- {}: {}", s.name, s.description))
            .collect::<Vec<_>>()
            .join("\n");
        let is_production = db.is_production(req.conn_id).unwrap_or(true);
        let hard_readonly = db.is_hard_readonly(req.conn_id).unwrap_or(is_production);
        let mut system = if hard_readonly {
            format!("{SYSTEM_PROMPT}\n\n{PRODUCTION_LOCKED_PROMPT}")
        } else if is_production {
            format!("{SYSTEM_PROMPT}\n\n{PRODUCTION_ADMIN_UNLOCKED_PROMPT}")
        } else {
            SYSTEM_PROMPT.to_string()
        };
        if !skill_blurb.is_empty() {
            system = format!("{system}\n\nAvailable skills:\n{skill_blurb}");
        }
        {
            let mut sessions = self.sessions.write();
            let session = sessions.entry(session_id).or_insert_with(|| Session {
                id: session_id,
                conn_id: req.conn_id,
                messages: vec![ChatMessage {
                    role: "system".into(),
                    content: system.clone(),
                    tool_call_id: None,
                    name: None,
                    tool_calls: None,
                }],
                last_context: BudgetReport::default(),
                cancel: CancellationToken::new(),
            });
            // Keep agent context scoped to the active connection.
            if session.conn_id != req.conn_id {
                session.conn_id = req.conn_id;
                session.messages = vec![ChatMessage {
                    role: "system".into(),
                    content: system.clone(),
                    tool_call_id: None,
                    name: None,
                    tool_calls: None,
                }];
                session.last_context = BudgetReport::default();
            } else if let Some(first) = session.messages.first_mut() {
                if first.role == "system" {
                    first.content = system;
                }
            }
            session.messages.push(ChatMessage {
                role: "user".into(),
                content: req.message,
                tool_call_id: None,
                name: None,
                tool_calls: None,
            });
        }

        let _ = self.ensure_ollama_model().await;
        let provider = self.provider()?;
        let tools = Self::tool_specs();
        let cancel = self
            .sessions
            .read()
            .get(&session_id)
            .map(|s| s.cancel.clone())
            .unwrap_or_else(CancellationToken::new);

        for _round in 0..8 {
            if cancel.is_cancelled() {
                let _ = app.emit(
                    "agent:error",
                    json!({"sessionId": session_id, "error": "Cancelled"}),
                );
                return Ok(session_id);
            }

            let messages = self
                .sessions
                .read()
                .get(&session_id)
                .map(|s| s.messages.clone())
                .unwrap_or_default();

            let (text, tool_calls) = match provider.complete(&messages, &tools).await {
                Ok(v) => v,
                Err(e) => {
                    let _ = app.emit(
                        "agent:error",
                        json!({"sessionId": session_id, "error": e.to_string()}),
                    );
                    return Err(e);
                }
            };

            if !text.is_empty() {
                let _ = app.emit(
                    "agent:delta",
                    json!({"sessionId": session_id, "delta": text}),
                );
            }

            if tool_calls.is_empty() {
                // Final text-only turn. Skip emitting empty assistant bubbles.
                if !text.is_empty() {
                    self.sessions.write().get_mut(&session_id).map(|s| {
                        s.messages.push(ChatMessage {
                            role: "assistant".into(),
                            content: text,
                            tool_call_id: None,
                            name: None,
                            tool_calls: None,
                        })
                    });
                }
                let _ = app.emit("agent:done", json!({"sessionId": session_id}));
                return Ok(session_id);
            }

            self.sessions.write().get_mut(&session_id).map(|s| {
                s.messages.push(ChatMessage {
                    role: "assistant".into(),
                    content: text,
                    tool_call_id: None,
                    name: None,
                    tool_calls: Some(tool_calls.clone()),
                })
            });

            for call in tool_calls {
                let _ = app.emit(
                    "agent:tool_call",
                    json!({
                        "sessionId": session_id,
                        "id": call.id,
                        "name": call.name,
                        "arguments": call.arguments,
                    }),
                );

                let result = self
                    .execute_tool(
                        &app,
                        session_id,
                        req.conn_id,
                        &db,
                        &skills,
                        &prompts,
                        &call,
                    )
                    .await;

                let content = match result {
                    Ok(ToolOutcome::Text(t)) => t,
                    Ok(ToolOutcome::AwaitingConfirm) => {
                        let _ = app.emit(
                            "agent:awaiting_confirm",
                            json!({"sessionId": session_id}),
                        );
                        return Ok(session_id);
                    }
                    Err(e) => format!("Error: {e}"),
                };

                let _ = app.emit(
                    "agent:tool_result",
                    json!({
                        "sessionId": session_id,
                        "id": call.id,
                        "name": call.name,
                        "result": truncate_for_event(&content),
                    }),
                );

                self.sessions.write().get_mut(&session_id).map(|s| {
                    s.messages.push(ChatMessage {
                        role: "tool".into(),
                        content,
                        tool_call_id: Some(call.id.clone()),
                        name: Some(call.name.clone()),
                        tool_calls: None,
                    })
                });
            }
        }

        let _ = app.emit(
            "agent:error",
            json!({"sessionId": session_id, "error": "Tool loop limit reached"}),
        );
        Ok(session_id)
    }

    async fn execute_tool(
        &self,
        app: &AppHandle,
        session_id: Uuid,
        conn_id: Uuid,
        db: &Arc<ConnectionManager>,
        skills: &Arc<SkillStore>,
        prompts: &Arc<PromptStore>,
        call: &ToolCall,
    ) -> AppResult<ToolOutcome> {
        let args: serde_json::Value =
            serde_json::from_str(&call.arguments).unwrap_or(json!({}));

        match call.name.as_str() {
            "inspect_schema" => {
                let schema = args["schema"].as_str();
                let table = args["table"].as_str();
                if let (Some(schema), Some(table)) = (schema, table) {
                    let desc = db
                        .describe_table(conn_id, schema.into(), table.into())
                        .await?;
                    let text = serde_json::to_string_pretty(&desc)?;
                    let slice = self.budgeter.truncate_text("table", text);
                    self.record_context(session_id, vec![slice.clone()]);
                    Ok(ToolOutcome::Text(slice.content))
                } else {
                    let nodes = db.list_schemas(conn_id).await?;
                    let mut summary = String::new();
                    let mut count = 0usize;
                    for schema in &nodes {
                        summary.push_str(&format!("schema {}\n", schema.name));
                        for child in &schema.children {
                            if count >= self.budgeter.budget().max_schema_tables {
                                summary.push_str("…more tables omitted\n");
                                break;
                            }
                            summary.push_str(&format!("  - {} ({})\n", child.name, child.kind));
                            count += 1;
                        }
                    }
                    let slice = self.budgeter.truncate_text("schema", summary);
                    self.record_context(session_id, vec![slice.clone()]);
                    Ok(ToolOutcome::Text(slice.content))
                }
            }
            "sample_rows" => {
                let schema = args["schema"].as_str().unwrap_or("public").to_string();
                let table = args["table"]
                    .as_str()
                    .ok_or_else(|| AppError::msg("table required"))?
                    .to_string();
                let limit = args["limit"]
                    .as_u64()
                    .unwrap_or(self.budgeter.budget().max_sample_rows as u64)
                    as usize;
                let page = db
                    .sample_rows(conn_id, schema, table, limit.min(20))
                    .await?;
                let cols: Vec<String> = page.columns.iter().map(|c| c.name.clone()).collect();
                let text = self.budgeter.summarize_rows(&cols, &page.rows, limit);
                let slice = self.budgeter.truncate_text("sample", text);
                self.record_context(session_id, vec![slice.clone()]);
                let _ = app.emit("query:result", &page);
                Ok(ToolOutcome::Text(slice.content))
            }
            "explain_query" => {
                let sql = args["sql"]
                    .as_str()
                    .ok_or_else(|| AppError::msg("sql required"))?
                    .to_string();
                let plan = db.explain(conn_id, sql).await?;
                let slice = self.budgeter.truncate_text("explain", plan);
                self.record_context(session_id, vec![slice.clone()]);
                Ok(ToolOutcome::Text(slice.content))
            }
            "run_query" => {
                let sql = args["sql"]
                    .as_str()
                    .ok_or_else(|| AppError::msg("sql required"))?
                    .to_string();
                if is_mutating_sql(&sql) {
                    let write =
                        db.request_write_approval(conn_id, sql.clone(), Some(session_id))?;
                    let pending = PendingConfirmation {
                        confirmation_id: write.confirmation_id,
                        session_id,
                        conn_id,
                        sql: write.sql,
                        reason: write.reason,
                        is_production: write.is_production,
                        admin_writes_unlocked: write.admin_writes_unlocked,
                    };
                    self.pending
                        .write()
                        .insert(pending.confirmation_id, pending.clone());
                    let _ = app.emit("agent:confirm", &pending);
                    return Ok(ToolOutcome::AwaitingConfirm);
                }
                let page = db
                    .run_query(
                        RunQueryRequest {
                            conn_id,
                            sql,
                            page_size: 500,
                            query_id: None,

                        },
                        false,
                    )
                    .await?;
                let cols: Vec<String> = page.columns.iter().map(|c| c.name.clone()).collect();
                let text = self.budgeter.summarize_rows(
                    &cols,
                    &page.rows,
                    self.budgeter.budget().max_result_rows,
                );
                let slice = self.budgeter.truncate_text("result", text);
                self.record_context(session_id, vec![slice.clone()]);
                let _ = app.emit("query:result", &page);
                Ok(ToolOutcome::Text(slice.content))
            }
            "list_skills" => {
                let list = skills.list()?;
                Ok(ToolOutcome::Text(serde_json::to_string_pretty(&list)?))
            }
            "save_skill" => {
                let name = args["name"].as_str().unwrap_or("untitled");
                let description = args["description"].as_str().unwrap_or("");
                let body = args["body"].as_str().unwrap_or("");
                let saved = skills.save(name, description, body)?;
                Ok(ToolOutcome::Text(serde_json::to_string_pretty(&saved)?))
            }
            "list_prompts" => {
                let list = prompts.list()?;
                Ok(ToolOutcome::Text(serde_json::to_string_pretty(&list)?))
            }
            "save_prompt" => {
                let title = args["title"].as_str().unwrap_or("Untitled").to_string();
                let body = args["body"].as_str().unwrap_or("").to_string();
                let saved = prompts.save_prompt(None, title, body)?;
                Ok(ToolOutcome::Text(serde_json::to_string_pretty(&saved)?))
            }
            other => Err(AppError::msg(format!("Unknown tool: {other}"))),
        }
    }

    fn record_context(&self, session_id: Uuid, slices: Vec<crate::agent::budgeter::ContextSlice>) {
        let report = self.budgeter.assemble(slices);
        if let Some(s) = self.sessions.write().get_mut(&session_id) {
            s.last_context = report;
        }
    }

    pub async fn confirm_and_run(
        &self,
        app: AppHandle,
        db: Arc<ConnectionManager>,
        confirmation_id: Uuid,
        approved: bool,
    ) -> AppResult<()> {
        let pending = self
            .pending
            .write()
            .remove(&confirmation_id)
            .ok_or_else(|| AppError::msg("Confirmation not found"))?;

        if !approved {
            // Also drop the staged write so it cannot be confirmed later.
            let _ = db.confirm_write(confirmation_id, false, None).await;
            let _ = app.emit(
                "agent:done",
                json!({"sessionId": pending.session_id, "cancelled": true}),
            );
            return Ok(());
        }

        let page = db
            .confirm_write(confirmation_id, true, None)
            .await?
            .ok_or_else(|| AppError::msg("Approved write returned no result"))?;
        let _ = app.emit("query:result", &page);
        let _ = app.emit(
            "agent:tool_result",
            json!({
                "sessionId": pending.session_id,
                "name": "run_query",
                "result": format!("Executed after HITL approval. rows={}, affected={:?}", page.total_rows, page.affected_rows),
            }),
        );
        let _ = app.emit("agent:done", json!({"sessionId": pending.session_id}));
        Ok(())
    }
}

enum ToolOutcome {
    Text(String),
    AwaitingConfirm,
}

fn truncate_for_event(s: &str) -> String {
    if s.len() > 2000 {
        format!("{}…", &s[..2000])
    } else {
        s.to_string()
    }
}

const SYSTEM_PROMPT: &str = r#"You are Prompton, a careful database agent in a desktop client.
Rules:
- Prefer read-only SELECT queries. Never invent table/column names; inspect schema first.
- Keep context small: use inspect_schema, sample_rows, and explain_query before large queries.
- Propose efficient SQL. Explain briefly what you will do.
- Mutating SQL (INSERT/UPDATE/DELETE/DDL) will pause for human-in-the-loop approval and will not run without it.
- When helpful, save reusable skills or prompts for the user.
"#;

const PRODUCTION_LOCKED_PROMPT: &str = r#"CRITICAL — PRODUCTION DATABASE (LOCKED READ-ONLY):
- This connection is marked PRODUCTION and writes are locked until a human/admin overrides.
- Prefer SELECT / EXPLAIN / schema inspection only.
- Do not run INSERT, UPDATE, DELETE, MERGE, TRUNCATE, or DDL unless the user explicitly asks.
- If the user asks to mutate data, you may propose SQL via run_query — it will pause for human-in-the-loop approval and will not execute without approval.
- An admin can unlock writes on the connection; until then treat production as read-only by default.
"#;

const PRODUCTION_ADMIN_UNLOCKED_PROMPT: &str = r#"PRODUCTION DATABASE — ADMIN WRITES UNLOCKED:
- An admin has unlocked writes on this production connection.
- You may propose mutations when the user asks, but every mutating statement still pauses for human-in-the-loop approval.
- Be explicit about risk. Prefer the smallest possible change. Never invent a way to skip confirmation.
"#;
