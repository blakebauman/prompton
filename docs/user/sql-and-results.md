# SQL & results

## SQL editor

Open **SQL** in the viewer (or jump there from a tool card / History).

| Control | Behavior |
| --- | --- |
| **Run** | Execute the current draft against the active connection |
| **Format** | Pretty-print SQL (best-effort) |
| **Explain** | Run dialect-appropriate EXPLAIN and open the Explain tab |
| **Cancel** | Abort the in-flight query for this connection |

Drafts persist per connection in local storage so you can switch connections and come back.

### Keyboard

Use the shortcuts configured in **Settings → Shortcuts** (defaults include Run).

## Results grid

After a successful read (or approved write that returns rows), **Results** shows a virtualized table:

- Column headers with types when available  
- Cell selection and copy  
- Pagination / row caps for large result sets (UI shows how many rows were returned vs truncated)  

Empty states explain whether you need to run a query, connect, or wait for approval.

### Cell edit

On editable result sets from certain queries, you can edit a cell and save. Saves that generate mutating SQL go through the same approval path as other writes when production / HITL rules apply.

## Chart

**Chart** builds a simple visualization when enough numeric columns exist. Use it for quick sense-checks, not BI dashboards.

## Export

Export actions (CSV / copy) operate on the **current result page** shown in the grid — not necessarily the full unbounded server result.

## Schema browser

**Schema** lists catalogs/schemas and tables for the active connection. Expand a table for columns. Actions typically include:

- Insert table/column names into the SQL draft  
- Refresh schema after DDL  

Schema inspection is read-only; it does not modify the database.

## Explain

**Explain** shows the last plan text from an Explain action or an agent `explain_query` tool call. Plans are diagnostic; they do not execute the underlying DML/DDL as a write unless you separately Run mutating SQL.
