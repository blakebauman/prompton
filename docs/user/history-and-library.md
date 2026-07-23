# History & Library

## History

**History** lists past SQL executions and agent turns for this machine.

### What is stored

Each entry typically includes:

- Timestamp and connection name/dialect when available  
- SQL text (for SQL runs)  
- Outcome: success, error, cancelled, rejected write, etc.  
- For agent turns: a transcript summary you can reload into chat  

Sensitive connection passwords are **not** written into history. Error messages shown in UI/history are sanitized for public display (internal details stay in logs where applicable).

### Actions

| Action | Effect |
| --- | --- |
| **Load SQL** | Puts the statement into the SQL editor |
| **Re-run** | Executes again against the **current** active connection (confirm target DB) |
| **Use in assistant** | Seeds the composer / thread from that entry |
| Search | Filters the list by text |

History is local JSON under the app data directory — see [Security & data](../technical/security-and-data.md).

## Library

**Library** holds reusable **skills** and **prompts**.

### Skills

A skill is a markdown document (`SKILL.md`) describing a reusable procedure the assistant can follow (e.g. “safe explore workflow”). Skills live under app data `skills/<name>/SKILL.md`.

Actions:

- Create / edit / rename / delete  
- **Use in assistant** — attach or send skill guidance into the chat flow  
- Search across skill titles and body  

### Prompts

Prompts are shorter saved snippets (starters, constraints, house style). Stored in `prompts.json`.

Same pattern: edit, search, send to assistant.

### Tips

- Keep skills specific (“Postgres index health check”) rather than generic essays.  
- Prefer skills that reinforce LIMIT / EXPLAIN / HITL habits.  
- Library content is not shared across machines unless you copy app data yourself.
