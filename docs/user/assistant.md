# Assistant (Prompton)

The assistant is the conversational front door to schema exploration, safe SELECTs, and explain/run workflows. It runs entirely in the desktop app; tools execute against your local connection pools in Rust.

## Prerequisites

1. An **active connection** (or open the demo SQLite).
2. A **configured provider** (Ollama / OpenAI-compatible / Anthropic) with a working model.

Without a connection, the empty state guides you to connect or open the demo. Without a provider, chat will fail until Settings → Provider is fixed.

## Asking questions

Type in the composer at the bottom of the Prompton panel. Starters on an empty thread include short chips such as:

- List tables  
- Sample a table  
- Draft SELECT + explain  

**New thread** clears the current conversation (header icon). **Stop** cancels an in-flight agent turn.

## What the agent can do

Tools the agent may call (summarized in chat as tool cards):

| Tool | Purpose |
| --- | --- |
| `inspect_schema` | List schemas/tables or describe a table |
| `sample_rows` | Sample a few rows from a table (capped) |
| `explain_query` | Explain a SQL statement |
| `run_query` | Run SQL — reads execute immediately; writes wait for approval |
| `list_skills` / `save_skill` | Work with Library skills |
| `list_prompts` / `save_prompt` | Work with Library prompts |

Tool cards show status (**Running**, **Awaiting approval**, **Done**, **Error**, etc.). Hover actions can open SQL in the editor, copy SQL, or jump to an artifact tab.

## Context discipline

The agent does **not** dump full tables into the model by default. A context budgeter sends capped slices (schema summaries, small samples, truncated results). After a turn, open **Context** in the viewer to inspect what was assembled.

Defaults (approximate): ~24k characters total, ~5 sample rows, ~30 result rows summarized, ~40 tables in schema lists.

## Writes and approvals

If the agent proposes mutating SQL (`INSERT` / `UPDATE` / `DELETE` / DDL / etc.), Prompton stages it and shows a confirmation dialog. Approve to run once; reject to deny. Production connections always require this human-in-the-loop step — see [Safety](./safety.md).

## Tips

- Prefer asking for **LIMIT**ed SELECTs and schema exploration before large scans.
- Use **History** to resume a prior agent transcript into the composer.
- Use **Library** skills/prompts as reusable instructions (“Use in assistant”).
