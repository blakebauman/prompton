# Prompton

High-performance, native, agentic database client — conversational-first — for exploring, querying, and managing databases.

**Domain:** [prompton.dev](https://prompton.dev)

## MVP features

- Multi-connection workspace (PostgreSQL + SQLite)
- Activity rail: Workspace · History · Library · Settings
- Conversational agent (Prompton) with tool calling in Rust
- SQL editor with cancel + confirmation for mutating statements
- Production connections stay read-only until HITL approval (optional admin unlock)
- Virtualized results grid with paged fetch, cell selection, CSV/JSON export (all / loaded / selection), and cell edit (single-table SELECT + PK via HITL)
- Schema explorer + artifact pane (Results / SQL / Schema / Explain / Context)
- Query + agent history (on-disk, list+detail)
- On-disk skills (`SKILL.md`) and prompt library with Library edit
- Context-budgeted agent tools (schema / samples / explain / run)
- Providers: Ollama (local), OpenAI-compatible, Anthropic
- Credentials in OS keyring; data stays on device by default

## Platforms

Primary targets: **macOS** and **Linux** (Windows packaging deferred).

### Linux dependencies

Install WebKitGTK and related build deps for your distro (see [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/)).

On Debian/Ubuntu typically:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

For keyring: a Secret Service provider (e.g. GNOME Keyring) should be running.

## Develop

Requirements: Node 20+, pnpm, Rust stable, platform Tauri deps.

```bash
pnpm install
pnpm tauri dev
```

Checks:

```bash
pnpm typecheck
pnpm test:rs
pnpm build
```

CI (GitHub Actions) runs frontend typecheck/build and `cargo test` on Ubuntu + macOS.

## Build

```bash
pnpm tauri build
```

Bundles: macOS `.app`/DMG; Linux AppImage / deb / rpm.

## Quick start

1. Open **Settings** (rail gear) and configure a model provider (Ollama local is the default).
2. In **Workspace**, add a Postgres/SQLite connection — or **Open demo SQLite**.
3. Ask Prompton a question, or run SQL from the artifact pane.
4. Browse **History** for recent queries/agent runs; edit skills/prompts in **Library**.

App data (connections, `history.json`, skills, prompts) lives under the OS app-data directory (`dev.prompton.desktop`).

On first launch after the bundle-id rename, Prompton copies missing files from the legacy `dev.prompton.app` folder (connections, history, prompts, agent settings, demo DB, skills). Keyring secrets (API keys / DB passwords) are not copied — re-enter those in Settings / connection edit if needed.

## Packaging

macOS (this machine):

```bash
pnpm tauri build --bundles app,dmg
```

Artifacts:
- `src-tauri/target/release/bundle/macos/Prompton.app`
- `src-tauri/target/release/bundle/dmg/Prompton_0.1.0_aarch64.dmg`

Linux bundles (`deb` / `appimage` / `rpm`) are configured in `tauri.conf.json`; build them on a Linux host or CI.

## Architecture

- **Frontend:** React + Vite + shadcn/ui monochrome (activity rail, list+detail, chat hub)
- **AI UI:** Vercel-style `ai-elements` (`Conversation`, `Message`/`MessageResponse`, `Tool`, `PromptInput`, `Suggestion`) — wired to the Tauri/Rust agent
- **Artifact pane:** switchable right pane (Results / Chart / SQL / Schema / Explain / Context)
- **Backend:** Tauri 2 / Rust — connection pools, query engine, agent runtime, history/skills/prompts, secrets

Agent tools never receive full tables by default; the context budgeter sends summaries and capped slices only. Switching connections cancels in-flight agent/query work and clears chat, results, and confirmations so sessions stay isolated.
