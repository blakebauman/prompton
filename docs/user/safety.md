# Safety & production

Prompton treats databases as potentially destructive. The app prefers **human-in-the-loop (HITL)** for anything that can change data or structure.

## Production connections

When you create a Postgres or MySQL connection, **Production** is enabled by default (SQLite defaults off). You can toggle it from the connection overflow menu.

On a production connection:

- Mutating SQL always requires explicit approval before it runs.
- Admin unlock (below) is available for temporary elevated workflows.

Marking a connection as production does **not** change the remote database — it only changes Prompton’s guardrails.

## What counts as mutating

Anything that is not a pure read is treated carefully, including (non-exhaustive):

- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`
- DDL: `CREATE`, `ALTER`, `DROP`, `RENAME`, …
- Postgres `SELECT INTO` (writes a new table)
- `EXPLAIN ANALYZE` (executes the statement)
- Dangerous SQLite `PRAGMA`s that change behavior or files

Reads such as `SELECT`, `WITH … SELECT`, `SHOW`, and non-analyzing `EXPLAIN` run without a write-approval dialog.

Classification happens in the Rust backend; the UI surfaces pending approvals with SQL preview.

## Approval dialog

When a write is staged:

1. Review the SQL carefully.
2. **Approve** runs it once against the active connection.
3. **Reject** cancels that pending write.

Pending writes expire after a short TTL (about **10 minutes**). Disconnecting or removing the connection cancels pending writes and in-flight work.

## Admin unlock

On production connections, **Admin unlock** (overflow menu) temporarily relaxes some UI friction for trusted operators. Treat it like sudo: unlock only when you intend to make changes, then lock again.

Unlock does not bypass the need to understand what you are running — prefer reading the SQL preview on every approval.

## Agent writes

When the assistant calls `run_query` with mutating SQL, the same HITL path applies. Tool cards show **Awaiting approval** until you decide.

## Practical habits

- Keep real prod DBs marked **Production**.
- Prefer asking the agent for `SELECT … LIMIT` and schema inspection before writes.
- Use a dedicated non-prod connection for experiments.
- Review History after sessions to audit what ran.
