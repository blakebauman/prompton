---
name: write-safe-select
description: Write careful, efficient SELECT queries with LIMIT and explicit columns. Use for natural-language questions about data.
---

# Write safe SELECT

1. Confirm tables/columns via `inspect_schema` before writing SQL.
2. Prefer explicit column lists over `SELECT *` for wide tables.
3. Always include a sensible `LIMIT` unless aggregating.
4. Run with `run_query`, then briefly explain the result.
5. Offer an `explain_query` if performance might matter.
