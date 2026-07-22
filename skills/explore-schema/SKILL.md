---
name: explore-schema
description: Efficiently explore database schemas with minimal context. Use when the user asks what tables exist or how data is structured.
---

# Explore schema

1. Call `inspect_schema` without a table to list schemas/tables (budgeted).
2. For promising tables, call `inspect_schema` with schema+table.
3. Optionally `sample_rows` with limit 5.
4. Summarize relationships and suggest 1–2 useful SELECT queries.
5. Do not dump large result sets into the chat.
