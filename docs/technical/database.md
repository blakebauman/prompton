# Database layer

Implementation: `src-tauri/src/db/` — `manager.rs`, dialect modules (`postgres.rs`, `mysql.rs`, `sqlite.rs`), `driver.rs`, `types.rs`.

## Responsibilities

`DbManager` owns:

- Saved connection configs (`connections.json`) without passwords  
- Live pools / drivers per connection id  
- Schema list / describe / sample / explain / run / page fetch  
- Query cancellation tokens  
- Pending write registry (HITL)  
- Production + admin-unlock flags per connection  

## Dialects

| Dialect | Module | Typical connect |
| --- | --- | --- |
| PostgreSQL | `postgres.rs` | Host/port/db/user + SSL mode; password from keyring |
| MySQL | `mysql.rs` | Host/port/db/user; password from keyring |
| SQLite | `sqlite.rs` | Filesystem path; demo DB under app data |

Host / `sslmode` validation lives in the connect path (reject obviously bad values early).

## Query pipeline

1. Frontend `run_query` / agent tool builds `RunQueryRequest` (`conn_id`, `sql`, paging, `query_id`).
2. `DbManager::run_query` classifies SQL with `is_mutating_sql`.
3. **Read** → execute via driver → `QueryPage` (columns, rows, totals, timing).
4. **Write** → if not already confirmed → create `PendingWrite`, return approval-required error/payload; UI calls `request_write_approval` / `confirm_write`.
5. Confirmed write executes once; TTL expires stale pendings (`PENDING_WRITE_TTL_SECS` = **600**).

`allow_mutating` on the Tauri command is **ignored** — all mutations must go through confirm.

### Cancel

`cancel_query(query_id)` signals client-side cancellation for work tracked by Prompton. Server-side abort depends on driver/server support; disconnect clears pending writes and in-flight cancel state for that connection.

### Paging

`fetch_query_page` returns additional pages for large results without re-sending full SQL when the backend retains page state for that query.

## HITL classification (`is_mutating_sql`)

Multi-statement aware: if **any** statement mutates, the batch requires HITL.

Treated as mutating (non-exhaustive; see unit tests in `types.rs`):

- DML/DDL keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `TRUNCATE`, …)
- Postgres `SELECT INTO`
- `EXPLAIN ANALYZE` (executes the plan)
- Dangerous SQLite `PRAGMA`s (e.g. `writable_schema`, `journal_mode=…`)
- Unknown leading keywords (fail closed)

Treated as non-mutating examples: plain `SELECT` / `WITH…SELECT`, non-ANALYZE `EXPLAIN`, safe `PRAGMA table_info`, comments-only wrappers around reads, string literals containing the word `DELETE`.

## Production & admin unlock

- `set_connection_production` — persisted with connection metadata  
- `set_admin_writes_unlocked` — session-style unlock for production UX  
- Tests: `production_writes_require_hitl`, TTL expiry, multi-statement write  

## Demo SQLite

`open_demo_sqlite` ensures a seeded `demo.db` under the app data dir and connects it for first-run exploration.

## Commands (DB-related)

`list_connections`, `connect_db`, `reconnect_db`, `ping_db`, `disconnect_db`, `remove_connection`, `list_schemas`, `describe_table`, `run_query`, `request_write_approval`, `confirm_write`, `discard_pending_write`, `set_connection_production`, `set_admin_writes_unlocked`, `cancel_query`, `fetch_query_page`, `explain_query`, `open_demo_sqlite`.

## Extending a dialect

1. Implement the shared driver trait methods in a new module.  
2. Wire connect + dispatch in `manager.rs` / `mod.rs`.  
3. Add classify edge cases if the dialect has write-like “reads.”  
4. Cover HITL + smoke paths in `manager_tests.rs`.
