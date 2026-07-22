use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    #[serde(rename = "openaiCompatible")]
    OpenAiCompatible,
    Anthropic,
    Ollama,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub kind: ProviderKind,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn complete(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
    ) -> AppResult<(String, Vec<ToolCall>)>;
}

pub struct HttpLlmProvider {
    pub config: ProviderConfig,
    pub api_key: Option<String>,
    client: reqwest::Client,
}

impl HttpLlmProvider {
    pub fn new(config: ProviderConfig, api_key: Option<String>) -> Self {
        Self {
            config,
            api_key,
            client: reqwest::Client::new(),
        }
    }

    fn openai_base(&self) -> String {
        match self.config.kind {
            ProviderKind::Ollama => self
                .config
                .base_url
                .clone()
                .unwrap_or_else(|| "http://127.0.0.1:11434/v1".into()),
            ProviderKind::OpenAiCompatible | ProviderKind::Anthropic => self
                .config
                .base_url
                .clone()
                .unwrap_or_else(|| {
                    if self.config.kind == ProviderKind::Anthropic {
                        "https://api.anthropic.com/v1".into()
                    } else {
                        "https://api.openai.com/v1".into()
                    }
                }),
        }
    }
}

#[async_trait]
impl LlmProvider for HttpLlmProvider {
    async fn complete(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
    ) -> AppResult<(String, Vec<ToolCall>)> {
        match self.config.kind {
            ProviderKind::Anthropic => self.complete_anthropic(messages, tools).await,
            _ => self.complete_openai(messages, tools).await,
        }
    }
}

impl HttpLlmProvider {
    async fn complete_openai(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
    ) -> AppResult<(String, Vec<ToolCall>)> {
        let url = format!("{}/chat/completions", self.openai_base().trim_end_matches('/'));
        let tool_defs: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                })
            })
            .collect();

        let msgs: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| {
                let mut obj = json!({
                    "role": m.role,
                    "content": m.content,
                });
                if let Some(id) = &m.tool_call_id {
                    obj["tool_call_id"] = json!(id);
                }
                if let Some(name) = &m.name {
                    obj["name"] = json!(name);
                }
                if let Some(calls) = &m.tool_calls {
                    obj["tool_calls"] = json!(calls
                        .iter()
                        .map(|c| json!({
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.name,
                                "arguments": c.arguments,
                            }
                        }))
                        .collect::<Vec<_>>());
                }
                obj
            })
            .collect();

        let mut body = json!({
            "model": self.config.model,
            "messages": msgs,
        });
        if !tool_defs.is_empty() {
            body["tools"] = json!(tool_defs);
            body["tool_choice"] = json!("auto");
        }

        let mut req = self.client.post(url).json(&body);
        if let Some(key) = &self.api_key {
            if !key.is_empty() {
                req = req.bearer_auth(key);
            }
        }

        let resp = req.send().await.map_err(|e| {
            AppError::msg(format!(
                "Cannot reach LLM at {} ({e}). For Ollama, run `ollama serve`.",
                self.openai_base()
            ))
        })?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::msg(crate::agent::ollama::friendly_llm_error(
                status,
                &text,
                &self.config.model,
            )));
        }

        let value: serde_json::Value = resp.json().await?;
        let choice = &value["choices"][0]["message"];
        let mut content = choice["content"]
            .as_str()
            .or_else(|| {
                // Some models return content as an array of parts
                choice["content"].as_array().map(|_| "")
            })
            .unwrap_or("")
            .to_string();
        if content.is_empty() {
            if let Some(arr) = choice["content"].as_array() {
                content = arr
                    .iter()
                    .filter_map(|p| p["text"].as_str().or_else(|| p.as_str()))
                    .collect::<Vec<_>>()
                    .join("");
            }
        }
        let mut tool_calls = Vec::new();
        if let Some(arr) = choice["tool_calls"].as_array() {
            for c in arr {
                tool_calls.push(ToolCall {
                    id: c["id"].as_str().unwrap_or("").to_string(),
                    name: c["function"]["name"].as_str().unwrap_or("").to_string(),
                    arguments: c["function"]["arguments"]
                        .as_str()
                        .unwrap_or("{}")
                        .to_string(),
                });
            }
        }
        // Qwen/Ollama often put tool calls in content as JSON instead.
        if tool_calls.is_empty() {
            let (prose, parsed) = crate::agent::tool_parse::extract_tool_calls_from_text(&content);
            if !parsed.is_empty() {
                content = prose;
                tool_calls = parsed;
            }
        } else {
            // Strip accidental JSON duplicates from content when structured calls exist.
            let (prose, _) = crate::agent::tool_parse::extract_tool_calls_from_text(&content);
            content = prose;
        }
        Ok((content, tool_calls))
    }

    async fn complete_anthropic(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
    ) -> AppResult<(String, Vec<ToolCall>)> {
        let url = format!(
            "{}/messages",
            self.config
                .base_url
                .as_deref()
                .unwrap_or("https://api.anthropic.com")
                .trim_end_matches('/')
        );

        let mut system = String::new();
        let mut anth_messages = Vec::new();
        for m in messages {
            if m.role == "system" {
                system.push_str(&m.content);
                system.push('\n');
                continue;
            }
            if m.role == "tool" {
                anth_messages.push(json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": m.tool_call_id,
                        "content": m.content,
                    }]
                }));
                continue;
            }
            if let Some(calls) = &m.tool_calls {
                let mut content = Vec::new();
                if !m.content.is_empty() {
                    content.push(json!({"type": "text", "text": m.content}));
                }
                for c in calls {
                    let input: serde_json::Value =
                        serde_json::from_str(&c.arguments).unwrap_or(json!({}));
                    content.push(json!({
                        "type": "tool_use",
                        "id": c.id,
                        "name": c.name,
                        "input": input,
                    }));
                }
                anth_messages.push(json!({"role": "assistant", "content": content}));
            } else {
                anth_messages.push(json!({
                    "role": if m.role == "assistant" { "assistant" } else { "user" },
                    "content": m.content,
                }));
            }
        }

        let tool_defs: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })
            })
            .collect();

        let mut body = json!({
            "model": self.config.model,
            "max_tokens": 4096,
            "messages": anth_messages,
        });
        if !system.is_empty() {
            body["system"] = json!(system);
        }
        if !tool_defs.is_empty() {
            body["tools"] = json!(tool_defs);
        }

        let mut req = self
            .client
            .post(url)
            .header("anthropic-version", "2023-06-01")
            .json(&body);
        if let Some(key) = &self.api_key {
            req = req.header("x-api-key", key);
        }

        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::msg(format!("Anthropic error {status}: {text}")));
        }
        let value: serde_json::Value = resp.json().await?;
        let mut text = String::new();
        let mut tool_calls = Vec::new();
        if let Some(blocks) = value["content"].as_array() {
            for b in blocks {
                match b["type"].as_str() {
                    Some("text") => {
                        if let Some(t) = b["text"].as_str() {
                            text.push_str(t);
                        }
                    }
                    Some("tool_use") => {
                        tool_calls.push(ToolCall {
                            id: b["id"].as_str().unwrap_or("").to_string(),
                            name: b["name"].as_str().unwrap_or("").to_string(),
                            arguments: b["input"].to_string(),
                        });
                    }
                    _ => {}
                }
            }
        }
        Ok((text, tool_calls))
    }
}
