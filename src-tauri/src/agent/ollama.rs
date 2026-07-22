use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub name: String,
    pub size: Option<u64>,
    pub supports_tools: bool,
}

#[derive(Deserialize)]
struct OllamaTags {
    models: Vec<OllamaTagModel>,
}

#[derive(Deserialize)]
struct OllamaTagModel {
    name: String,
    size: Option<u64>,
    details: Option<OllamaDetails>,
    #[serde(default)]
    capabilities: Vec<String>,
}

#[derive(Deserialize)]
struct OllamaDetails {
    #[serde(default)]
    family: Option<String>,
}

/// Prefer tool-capable models; fall back to any installed model.
pub fn pick_default_model(models: &[LocalModel]) -> Option<String> {
    models
        .iter()
        .find(|m| m.supports_tools)
        .or_else(|| models.first())
        .map(|m| m.name.clone())
}

pub async fn list_ollama_models(base_url: &str) -> AppResult<Vec<LocalModel>> {
    let root = ollama_api_root(base_url);
    let url = format!("{root}/api/tags");
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| {
        AppError::msg(format!(
            "Cannot reach Ollama at {root} ({e}). Start it with `ollama serve`."
        ))
    })?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::msg(format!(
            "Ollama tags failed ({status}): {text}"
        )));
    }
    let tags: OllamaTags = resp.json().await?;
    let mut out: Vec<LocalModel> = tags
        .models
        .into_iter()
        .map(|m| {
            let supports_tools = m.capabilities.iter().any(|c| c == "tools")
                || m.name.contains("coder")
                || m.name.contains("qwen")
                || m.details
                    .as_ref()
                    .and_then(|d| d.family.as_deref())
                    .is_some_and(|f| f.contains("qwen") || f.contains("llama"));
            LocalModel {
                name: m.name,
                size: m.size,
                supports_tools,
            }
        })
        .collect();
    out.sort_by(|a, b| match (b.supports_tools, a.supports_tools) {
        (true, false) => std::cmp::Ordering::Greater,
        (false, true) => std::cmp::Ordering::Less,
        _ => a.name.cmp(&b.name),
    });
    // Prefer tools=true first after sort reverse for supports_tools
    out.sort_by(|a, b| b.supports_tools.cmp(&a.supports_tools).then(a.name.cmp(&b.name)));
    Ok(out)
}

fn ollama_api_root(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if let Some(root) = trimmed.strip_suffix("/v1") {
        root.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn friendly_llm_error(status: reqwest::StatusCode, body: &str, model: &str) -> String {
    if body.contains("not found") || status.as_u16() == 404 {
        return format!(
            "Model '{model}' not found in Ollama. Open Settings → pick an installed model, or run `ollama pull {model}`.\n\n{body}"
        );
    }
    if status.as_u16() == 0 || body.contains("Connection refused") {
        return format!(
            "Cannot reach the model provider. For Ollama, run `ollama serve`.\n\n{body}"
        );
    }
    format!("LLM error {status}: {body}")
}
