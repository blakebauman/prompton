# Workspace

The Workspace activity is the main three-pane layout:

1. **Connections** (left) — databases you can switch between  
2. **Prompton** (center) — assistant chat and composer  
3. **Viewer** (right, toggleable) — Results, Chart, SQL, Schema, Explain, Context  

The activity rail on the far left switches **Workspace · History · Library · Settings**.

## Connections

Each connection has a name, dialect, status (Connected / Offline), and optional **production** badge.

### Add a connection

| Dialect | Typical fields |
| --- | --- |
| PostgreSQL | Host, port (5432), database, username, password, SSL mode |
| MySQL | Host, port (3306), database, username, password |
| SQLite | File path on disk |

**Find local DBs** (hard-drive icon in Connections) scans your home folders and mounted volumes for SQLite files (`.db` / `.sqlite` / …) with recent activity. Hits are verified with the SQLite header, ranked by last activity (including `-wal` sidecars), then you can **Connect** in one click.

**Production** is on by default for Postgres/MySQL (off for SQLite). Production connections treat mutating SQL as requiring approval — see [Safety](./safety.md).

### Connection actions

Hover a row for **Connect / Disconnect**. Overflow (**⋯**) covers production mark, admin unlock (production only), and remove.

**Remove** deletes the saved connection and keyring password for that ID. It does **not** delete the database file.

### Switching connections

Changing the active connection cancels in-flight queries/agent work and clears chat, results, and pending write confirmations so sessions stay isolated.

## Artifact viewer

Toggle with the header “viewer” control (or open from SQL / tool cards).

| Tab | Purpose |
| --- | --- |
| **Results** | Virtualized grid for the last query page |
| **Chart** | Simple charts over numeric result columns |
| **SQL** | Editor for the current draft (run / format / explain / cancel) |
| **Schema** | Browse schemas, tables, columns; insert identifiers into SQL |
| **Explain** | Last explain plan text |
| **Context** | Last agent context budget report (what was sent to the model) |

## Status

The top chrome shows the product tagline and, when relevant, the active connection. Transient status (query finished, errors) appears as a dismissible pill.

## Keyboard shortcuts

Defaults (customizable in **Settings → Shortcuts**):

| Action | Typical default (macOS) |
| --- | --- |
| Run SQL | ⌘↩ |
| Format SQL | (bound in Settings) |
| Cancel query | (bound in Settings) |

Shortcuts are app-local while Prompton is focused — not global OS hotkeys.
