# Security & data

## Identifier

| Item | Value |
| --- | --- |
| Bundle / app data folder name | `dev.prompton.desktop` |
| Keyring service | `dev.prompton.desktop` |
| Legacy folder (migration source) | `dev.prompton.app` |

## Secrets (OS keyring only)

`SecretStore` (`src-tauri/src/secrets.rs`):

| Account key | Contents |
| --- | --- |
| `conn-{uuid}` | Database password for that connection id |
| `api-{provider}` | LLM API key for that provider kind |

Never write passwords or API keys into `connections.json`, `history.json`, or `agent_settings.json`.

On Linux, a Secret Service implementation (e.g. GNOME Keyring) should be available or keyring ops fail.

## On-disk app data

Resolved via Tauri app data dir (`app_data_dir` command). Typical layout:

```
<app-data>/dev.prompton.desktop/
  connections.json      # metadata only (no passwords)
  history.json          # query + agent history
  prompts.json          # prompt library
  agent_settings.json   # provider kind, URLs, model (no key)
  demo.db[+wal/shm]     # optional demo SQLite
  skills/<name>/SKILL.md
  .migrated-from-dev.prompton.app   # migration marker
```

Exact parent path is OS-specific (macOS Application Support, Linux XDG, etc.).

### Frontend local storage

Theme, shortcut bindings, per-connection SQL drafts, and similar UX state live in the webview’s local storage — not secrets.

## Migration

`migrate.rs` copies **missing** files from `dev.prompton.app` → `dev.prompton.desktop` once (flat files + skills merge). Existing destination files win. **Keyring entries are not migrated** — users re-enter passwords and API keys.

## Error surfaces

`AppError::public_message()` is what UI/history should show. Prefer public messages for user-visible failures; keep internal detail out of history payloads.

## Skills path safety

Skill `get` sanitizes names/paths so Library reads cannot escape the skills directory (path traversal hardening).

## Privacy model (product)

| Data | Default behavior |
| --- | --- |
| DB credentials | Device keyring |
| Connection metadata / history / skills | Local app data |
| Query results → LLM | Only when agent tools run against your configured provider |
| Telemetry | None built into the MVP product surface |

Remote providers see whatever the budgeter includes in tool results and chat messages. Prefer Ollama for air-gapped workflows.

## Threat notes for teams

- Treat the webview as untrusted for secret storage.  
- HITL is defense-in-depth against accidental writes, not a substitute for DB grants / network isolation.  
- Ad-hoc macOS builds are not notarized — distribute via Releases and document Gatekeeper steps for users.  
- Provider base URLs are user-controlled; no strict allowlist in-app today — document trust expectations for enterprise deploy.
