# Architecture

Prompton is a **Tauri 2** desktop app: a React/Vite frontend talks to a Rust backend over Tauri commands and events. Databases and LLM providers are contacted from Rust only.

```
┌─────────────────────────────────────────────────────────────┐
│  React shell (Vite)                                         │
│  Activity rail → Workspace | History | Library | Settings   │
│  Workspace: Connections | Chat (Prompton) | Artifact pane   │
│  Zustand stores · localStorage drafts/theme/shortcuts       │
└──────────────────────────┬──────────────────────────────────┘
                           │ invoke / events
┌──────────────────────────▼──────────────────────────────────┐
│  Rust (src-tauri)                                           │
│  commands/ · db/ · agent/ · history/ · skills/ · prompts/   │
│  secrets (OS keyring) · migrate · AppState                  │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
   Postgres / MySQL / SQLite      Ollama / OpenAI-compat / Anthropic
```

## Repo map

| Path | Role |
| --- | --- |
| `src/` | React UI, features, stores, Tauri client wrappers |
| `src-tauri/` | Rust backend, Tauri config, bundling |
| `skills/` | Bundled starter skills (copied/used with Library) |
| `docs/` | User + technical documentation |
| `scripts/` | Version sync (`set-version.mjs`, `check-version.mjs`) |
| `.github/workflows/` | `ci.yml`, `release.yml` |
| `PRODUCT.md` | Brand / product constraints |

## Runtime responsibilities

| Concern | Owner |
| --- | --- |
| Connection pools, SQL classify, HITL pending writes | `src-tauri/src/db/` |
| Agent loop, tools, providers, context budget | `src-tauri/src/agent/` |
| History / skills / prompts persistence | `history/`, `skills/`, `prompts/` |
| Passwords & API keys | `secrets.rs` → OS keyring service `dev.prompton.desktop` |
| UI layout, chat UX, grids, settings forms | `src/features/*`, `src/components/*` |
| Session isolation on connection switch | Frontend workspace + Rust cancel/teardown |

## Trust boundary

- The webview never holds DB passwords or API keys in durable form; it invokes Rust, which reads the keyring at use time.
- Mutating SQL cannot bypass HITL via a frontend `allow_mutating` flag — commands ignore that path and require `confirm_write` / agent confirm.
- Query **results** and **schema** may be sent to the configured LLM when the agent runs tools. Local-only data plane means “don’t use a remote model you don’t trust,” not “never leaves the process.”

## Related docs

- [Agent runtime](./agent.md)
- [Database layer](./database.md)
- [Security & data](./security-and-data.md)
- [Frontend](./frontend.md)
