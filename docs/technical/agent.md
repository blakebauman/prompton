# Agent runtime

Implementation: `src-tauri/src/agent/` (`runtime.rs`, `providers.rs`, `budgeter.rs`, `tool_parse.rs`, `ollama.rs`).

## Flow

1. Frontend calls `agent_chat` with session id, messages, and active `conn_id`.
2. Runtime loads `agent_settings.json` + API key from keyring when needed.
3. Model is invoked with a system prompt that prefers small, safe exploration.
4. Tool calls are parsed and executed against `DbManager` / skills / prompts.
5. Tool results are budget-truncated, then fed back to the model until the turn ends or cancel.
6. Events stream to the UI (token/tool status); history can record the turn.

Cancel: `agent_cancel(session_id)`. Connection switch / disconnect tears down related in-flight agent work and pending writes.

## Tools

| Name | Behavior |
| --- | --- |
| `inspect_schema` | List schemas/tables or describe one table; schema lists capped |
| `sample_rows` | Sample rows (`LIMIT` capped; hard max 20 in runtime) |
| `explain_query` | Dialect explain; result truncated for context |
| `run_query` | Reads execute; mutating SQL stages HITL confirmation |
| `list_skills` / `save_skill` | Library skills on disk |
| `list_prompts` / `save_prompt` | Prompt library JSON |

Mutating `run_query` surfaces pending confirmation to the UI (`agent_confirm` / discard paths). Same classification as the SQL editor (`is_mutating_sql`).

## Context budget (defaults)

From `ContextBudget::default()`:

| Knob | Default |
| --- | --- |
| `max_chars` | 24_000 |
| `max_sample_rows` | 5 |
| `max_result_rows` | 30 |
| `max_schema_tables` | 40 |

`ContextBudgeter` truncates individual slices and assembles a `BudgetReport`. Frontend can call `agent_last_context` and show it under the **Context** artifact tab.

Design intent: agents never receive full tables by default.

## Providers

Configured via Settings → `agent_set_settings` / `agent_get_settings`.

| Kind | Notes |
| --- | --- |
| Ollama | Default base `http://127.0.0.1:11434/v1`; `list_ollama_models` helper |
| OpenAI-compatible | Custom base URL + model + key (`api-{provider}` in keyring) |
| Anthropic | Anthropic Messages-style path + key |

Provider config defaults: `default_provider_config`, `get_provider_kinds`.

## Commands (agent-related)

- `agent_chat`, `agent_cancel`, `agent_confirm`
- `agent_get_settings`, `agent_set_settings`
- `agent_last_context`, `agent_has_session`
- `discard_pending_write` (shared with SQL HITL)
- `list_ollama_models`

## Testing

- `budgeter_tests.rs` — truncation / assemble behavior  
- DB HITL tests cover agent-aligned mutating classification (`manager_tests.rs`)

When changing tools: update system prompt hints, `tool_parse`, runtime dispatch, and frontend tool-card summaries (`src/lib/tool-summary.ts`) together.
