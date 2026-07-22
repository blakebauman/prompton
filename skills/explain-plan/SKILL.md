---
name: explain-plan
description: Analyze query plans with EXPLAIN and suggest indexes or rewrites. Use when the user asks why a query is slow.
---

# Explain plan

1. Take the SQL (or draft it).
2. Call `explain_query`.
3. Interpret sequential scans, joins, and row estimates in plain language.
4. Suggest one concrete improvement at a time.
