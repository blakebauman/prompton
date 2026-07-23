# Getting started

Prompton is a native desktop database client. You talk to your data in natural language **or** write SQL directly. The assistant (Prompton) is the hub; Results, SQL, Schema, and related views live in the artifact pane.

**Dialects:** PostgreSQL, MySQL, SQLite  
**Platforms:** macOS and Linux (Windows packaging deferred)  
**Privacy default:** credentials stay in the OS keyring; query data stays on your machine unless you point a remote LLM at a provider you control.

## Install

1. Download the latest build from [GitHub Releases](https://github.com/blakebauman/prompton/releases).
2. **macOS:** open the `.dmg` and drag Prompton to Applications.
   - Builds without Apple Developer ID signing are **ad-hoc**. First launch: right-click → **Open**, or run `xattr -cr /Applications/Prompton.app`.
3. **Linux:** install `.deb` / `.rpm`, or run the AppImage.

In-app updates: **Settings → About → Check for updates** (reads `latest.json` from the latest GitHub release).

## First five minutes

### 1. Configure a model (optional for SQL-only)

1. Open **Settings** from the activity rail (gear).
2. Open the **Provider** tab.
3. Default is **Ollama** at `http://127.0.0.1:11434/v1`.
   - Start Ollama locally and pull a tool-capable model (e.g. a coder model that supports tools).
4. Or switch to **OpenAI-compatible** or **Anthropic** and paste an API key (stored in the OS keyring).

You can still connect databases and run SQL without a provider; the assistant needs one.

### 2. Connect a database

1. Open **Workspace** (first rail icon).
2. In **Connections**, click **+** or **Add connection**.
3. Choose Postgres, MySQL, or SQLite and fill connection details.
4. Or click **Open demo SQLite** to explore a seeded local database with no setup.

### 3. Ask or run SQL

- In the center **Prompton** panel, ask things like “What tables exist?” or “Sample the widest table safely.”
- Or open the **viewer** (right pane) → **SQL**, write a query, and **Run**.
- Results appear under **Results**; schema under **Schema**.

### 4. Browse history and library

- **History** — past SQL and agent runs (re-run, load SQL, use in assistant).
- **Library** — skills and prompts you can edit and send to the assistant.

## What stays on your device

| Data | Where |
| --- | --- |
| DB passwords, LLM API keys | OS keyring (`dev.prompton.desktop`) |
| Connection metadata (no passwords) | App data `connections.json` |
| History, prompts, skills | App data under the OS app-data directory |
| Drafts / theme / shortcuts | Browser/webview local storage |

See [Security & data](../technical/security-and-data.md) for paths and migration notes.

## Next

- [Workspace](./workspace.md)
- [Assistant](./assistant.md)
- [Safety & production](./safety.md)
