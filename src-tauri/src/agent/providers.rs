use std::collections::HashMap;

use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_util::sync::CancellationToken;

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

/// Optional text-delta callback for streaming completions.
pub type OnTextDelta<'a> = Option<&'a (dyn Fn(&str) + Sync)>;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn complete(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_delta: OnTextDelta<'_>,
        cancel: Option<&CancellationToken>,
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
        on_delta: OnTextDelta<'_>,
        cancel: Option<&CancellationToken>,
    ) -> AppResult<(String, Vec<ToolCall>)> {
        match self.config.kind {
            ProviderKind::Anthropic => {
                match self
                    .stream_anthropic(messages, tools, on_delta, cancel)
                    .await
                {
                    Ok(v) => Ok(v),
                    Err(e) => {
                        // Fall back to non-stream if the provider rejects streaming.
                        let msg = e.to_string();
                        if msg.contains("stream") || msg.contains("400") {
                            let (text, calls) =
                                self.complete_anthropic(messages, tools).await?;
                            if !text.is_empty() {
                                if let Some(cb) = on_delta {
                                    cb(&text);
                                }
                            }
                            Ok((text, calls))
                        } else {
                            Err(e)
                        }
                    }
                }
            }
            _ => match self
                .stream_openai(messages, tools, on_delta, cancel)
                .await
            {
                Ok(v) => Ok(v),
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("stream")
                        || msg.contains("400")
                        || msg.contains("does not support")
                    {
                        let (text, calls) = self.complete_openai(messages, tools).await?;
                        if !text.is_empty() {
                            if let Some(cb) = on_delta {
                                cb(&text);
                            }
                        }
                        Ok((text, calls))
                    } else {
                        Err(e)
                    }
                }
            },
        }
    }
}

impl HttpLlmProvider {
    fn openai_messages_body(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        stream: bool,
    ) -> serde_json::Value {
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
            "stream": stream,
        });
        if !tool_defs.is_empty() {
            body["tools"] = json!(tool_defs);
            body["tool_choice"] = json!("auto");
        }
        body
    }

    async fn complete_openai(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
    ) -> AppResult<(String, Vec<ToolCall>)> {
        let url = format!("{}/chat/completions", self.openai_base().trim_end_matches('/'));
        let body = self.openai_messages_body(messages, tools, false);

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
        parse_openai_message(&value["choices"][0]["message"])
    }

    async fn stream_openai(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_delta: OnTextDelta<'_>,
        cancel: Option<&CancellationToken>,
    ) -> AppResult<(String, Vec<ToolCall>)> {
        let url = format!("{}/chat/completions", self.openai_base().trim_end_matches('/'));
        let body = self.openai_messages_body(messages, tools, true);

        let mut req = self.client.post(&url).json(&body);
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

        let mut byte_stream = resp.bytes_stream();
        let mut line_buf = String::new();
        let mut content = String::new();
        // index -> (id, name, arguments)
        let mut tool_acc: HashMap<i64, (String, String, String)> = HashMap::new();

        while let Some(item) = byte_stream.next().await {
            if cancel.map(|c| c.is_cancelled()).unwrap_or(false) {
                return Err(AppError::msg("Cancelled"));
            }
            let bytes = item.map_err(|e| AppError::msg(format!("LLM stream error: {e}")))?;
            line_buf.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = line_buf.find('\n') {
                let mut line = line_buf[..pos].to_string();
                line_buf = line_buf[pos + 1..].to_string();
                if line.ends_with('\r') {
                    line.pop();
                }
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if !line.starts_with("data:") {
                    continue;
                }
                let data = line[5..].trim();
                if data == "[DONE]" {
                    return Ok(finalize_openai_stream(content, tool_acc));
                }
                let value: serde_json::Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(err) = value.get("error") {
                    return Err(AppError::msg(format!("LLM stream error: {err}")));
                }
                let delta = &value["choices"][0]["delta"];
                if let Some(t) = delta["content"].as_str() {
                    if !t.is_empty() {
                        content.push_str(t);
                        if let Some(cb) = on_delta {
                            cb(t);
                        }
                    }
                }
                if let Some(arr) = delta["tool_calls"].as_array() {
                    for tc in arr {
                        let idx = tc["index"].as_i64().unwrap_or(0);
                        let entry = tool_acc.entry(idx).or_insert_with(|| {
                            (String::new(), String::new(), String::new())
                        });
                        if let Some(id) = tc["id"].as_str() {
                            if !id.is_empty() {
                                entry.0 = id.to_string();
                            }
                        }
                        if let Some(name) = tc["function"]["name"].as_str() {
                            if !name.is_empty() {
                                entry.1.push_str(name);
                            }
                        }
                        if let Some(args) = tc["function"]["arguments"].as_str() {
                            entry.2.push_str(args);
                        }
                    }
                }
            }
        }

        Ok(finalize_openai_stream(content, tool_acc))
    }

    async fn complete_anthropic(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
    ) -> AppResult<(String, Vec<ToolCall>)> {
        let (url, body, _) = self.anthropic_request(messages, tools, false);
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
        parse_anthropic_message(&value)
    }

    async fn stream_anthropic(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_delta: OnTextDelta<'_>,
        cancel: Option<&CancellationToken>,
    ) -> AppResult<(String, Vec<ToolCall>)> {
        let (url, body, _) = self.anthropic_request(messages, tools, true);
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

        let mut byte_stream = resp.bytes_stream();
        let mut line_buf = String::new();
        let mut content = String::new();
        let mut tool_calls = Vec::new();
        let mut current_tool: Option<(String, String, String)> = None; // id, name, args json

        while let Some(item) = byte_stream.next().await {
            if cancel.map(|c| c.is_cancelled()).unwrap_or(false) {
                return Err(AppError::msg("Cancelled"));
            }
            let bytes = item.map_err(|e| AppError::msg(format!("LLM stream error: {e}")))?;
            line_buf.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = line_buf.find('\n') {
                let mut line = line_buf[..pos].to_string();
                line_buf = line_buf[pos + 1..].to_string();
                if line.ends_with('\r') {
                    line.pop();
                }
                let line = line.trim();
                if line.is_empty() || line.starts_with("event:") {
                    continue;
                }
                if !line.starts_with("data:") {
                    continue;
                }
                let data = line[5..].trim();
                if data == "[DONE]" {
                    break;
                }
                let value: serde_json::Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                match value["type"].as_str() {
                    Some("content_block_start") => {
                        if value["content_block"]["type"].as_str() == Some("tool_use") {
                            current_tool = Some((
                                value["content_block"]["id"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string(),
                                value["content_block"]["name"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string(),
                                String::new(),
                            ));
                        }
                    }
                    Some("content_block_delta") => {
                        let delta = &value["delta"];
                        match delta["type"].as_str() {
                            Some("text_delta") => {
                                if let Some(t) = delta["text"].as_str() {
                                    if !t.is_empty() {
                                        content.push_str(t);
                                        if let Some(cb) = on_delta {
                                            cb(t);
                                        }
                                    }
                                }
                            }
                            Some("input_json_delta") => {
                                if let Some(partial) = delta["partial_json"].as_str() {
                                    if let Some(tool) = current_tool.as_mut() {
                                        tool.2.push_str(partial);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    Some("content_block_stop") => {
                        if let Some((id, name, args)) = current_tool.take() {
                            let args = if args.is_empty() {
                                "{}".into()
                            } else {
                                args
                            };
                            tool_calls.push(ToolCall {
                                id,
                                name,
                                arguments: args,
                            });
                        }
                    }
                    Some("error") => {
                        return Err(AppError::msg(format!(
                            "Anthropic stream error: {}",
                            value["error"]
                        )));
                    }
                    _ => {}
                }
            }
        }

        Ok((content, tool_calls))
    }

    fn anthropic_request(
        &self,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        stream: bool,
    ) -> (String, serde_json::Value, ()) {
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
            "stream": stream,
        });
        if !system.is_empty() {
            body["system"] = json!(system);
        }
        if !tool_defs.is_empty() {
            body["tools"] = json!(tool_defs);
        }
        (url, body, ())
    }
}

fn finalize_openai_stream(
    mut content: String,
    tool_acc: HashMap<i64, (String, String, String)>,
) -> (String, Vec<ToolCall>) {
    let mut tool_calls: Vec<(i64, ToolCall)> = tool_acc
        .into_iter()
        .map(|(idx, (id, name, arguments))| {
            (
                idx,
                ToolCall {
                    id: if id.is_empty() {
                        format!("call_{idx}")
                    } else {
                        id
                    },
                    name,
                    arguments: if arguments.is_empty() {
                        "{}".into()
                    } else {
                        arguments
                    },
                },
            )
        })
        .collect();
    tool_calls.sort_by_key(|(idx, _)| *idx);
    let mut tool_calls: Vec<ToolCall> = tool_calls.into_iter().map(|(_, c)| c).collect();

    if tool_calls.is_empty() {
        let (prose, parsed) = crate::agent::tool_parse::extract_tool_calls_from_text(&content);
        if !parsed.is_empty() {
            content = prose;
            tool_calls = parsed;
        }
    } else {
        let (prose, _) = crate::agent::tool_parse::extract_tool_calls_from_text(&content);
        content = prose;
    }
    (content, tool_calls)
}

fn parse_openai_message(choice: &serde_json::Value) -> AppResult<(String, Vec<ToolCall>)> {
    let mut content = choice["content"]
        .as_str()
        .or_else(|| choice["content"].as_array().map(|_| ""))
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
    if tool_calls.is_empty() {
        let (prose, parsed) = crate::agent::tool_parse::extract_tool_calls_from_text(&content);
        if !parsed.is_empty() {
            content = prose;
            tool_calls = parsed;
        }
    } else {
        let (prose, _) = crate::agent::tool_parse::extract_tool_calls_from_text(&content);
        content = prose;
    }
    Ok((content, tool_calls))
}

fn parse_anthropic_message(value: &serde_json::Value) -> AppResult<(String, Vec<ToolCall>)> {
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

#[cfg(test)]
mod stream_parse_tests {
    use super::*;

    #[test]
    fn assembles_chunked_tool_arguments() {
        let mut acc: HashMap<i64, (String, String, String)> = HashMap::new();
        acc.insert(
            0,
            (
                "call_1".into(),
                "run_query".into(),
                "{\"sql\":\"SELECT ".into(),
            ),
        );
        // Simulate second chunk appending args
        acc.get_mut(&0).unwrap().2.push_str("1\"}");
        let (content, calls) = finalize_openai_stream(String::from("Running that."), acc);
        assert_eq!(content, "Running that.");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "run_query");
        assert!(calls[0].arguments.contains("SELECT 1"));
    }
}
