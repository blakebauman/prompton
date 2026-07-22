use uuid::Uuid;

use crate::agent::providers::ToolCall;

/// Some local models (notably Qwen via Ollama) emit tool calls as JSON in
/// `message.content` instead of the OpenAI `tool_calls` array. Extract those
/// objects and return remaining prose for the chat UI.
pub fn extract_tool_calls_from_text(text: &str) -> (String, Vec<ToolCall>) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return (String::new(), vec![]);
    }

    let mut calls = Vec::new();
    let mut kept = String::new();
    let mut rest = trimmed;

    while let Some(start) = rest.find('{') {
        kept.push_str(&rest[..start]);
        let Some((json, after)) = take_json_object(&rest[start..]) else {
            kept.push_str(rest);
            rest = "";
            break;
        };
        if let Some(call) = parse_tool_call_json(json) {
            calls.push(call);
        } else {
            kept.push_str(json);
        }
        rest = after.trim_start();
    }
    kept.push_str(rest);

    let prose = kept
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    (prose, calls)
}

fn take_json_object(s: &str) -> Option<(&str, &str)> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'{') {
        return None;
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    for (i, &b) in bytes.iter().enumerate() {
        if in_string {
            if escape {
                escape = false;
            } else if b == b'\\' {
                escape = true;
            } else if b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some((&s[..=i], &s[i + 1..]));
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_tool_call_json(json: &str) -> Option<ToolCall> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let obj = value.as_object()?;

    // Shape A: { "name": "...", "arguments": {...} | "..." }
    if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
        if looks_like_tool_name(name) {
            let arguments = match obj.get("arguments") {
                Some(serde_json::Value::String(s)) => s.clone(),
                Some(other) => other.to_string(),
                None => "{}".into(),
            };
            return Some(ToolCall {
                id: format!("call_{}", Uuid::new_v4().simple()),
                name: name.to_string(),
                arguments,
            });
        }
    }

    // Shape B: { "tool": "...", "params"|"arguments": ... }
    if let Some(name) = obj.get("tool").and_then(|v| v.as_str()) {
        if looks_like_tool_name(name) {
            let arguments = match obj.get("arguments").or_else(|| obj.get("params")) {
                Some(serde_json::Value::String(s)) => s.clone(),
                Some(other) => other.to_string(),
                None => "{}".into(),
            };
            return Some(ToolCall {
                id: format!("call_{}", Uuid::new_v4().simple()),
                name: name.to_string(),
                arguments,
            });
        }
    }

    // Shape C: OpenAI-ish { "function": { "name", "arguments" } }
    if let Some(func) = obj.get("function").and_then(|v| v.as_object()) {
        if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
            if looks_like_tool_name(name) {
                let arguments = match func.get("arguments") {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(other) => other.to_string(),
                    None => "{}".into(),
                };
                return Some(ToolCall {
                    id: obj
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| format!("call_{}", Uuid::new_v4().simple())),
                    name: name.to_string(),
                    arguments,
                });
            }
        }
    }

    None
}

fn looks_like_tool_name(name: &str) -> bool {
    matches!(
        name,
        "inspect_schema"
            | "sample_rows"
            | "explain_query"
            | "run_query"
            | "cancel_query"
            | "list_skills"
            | "save_skill"
            | "list_prompts"
            | "save_prompt"
    ) || (name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c == '_')
        && name.contains('_')
        && name.len() >= 3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_concatenated_calls() {
        let raw = r#"{ "name": "list_skills", "arguments": {} }{ "name": "list_skills", "arguments": {} }"#;
        let (prose, calls) = extract_tool_calls_from_text(raw);
        assert!(prose.is_empty());
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "list_skills");
    }

    #[test]
    fn keeps_prose_around_call() {
        let raw = r#"I'll check skills.
{ "name": "list_skills", "arguments": {} }
Done."#;
        let (prose, calls) = extract_tool_calls_from_text(raw);
        assert_eq!(calls.len(), 1);
        assert!(prose.contains("I'll check"));
        assert!(prose.contains("Done."));
    }
}
