import type { Dialect } from "@/lib/types";

/** Best-effort parse of a single-table SELECT (no JOIN/UNION). */
export function parseSimpleSelectTarget(
  sql: string,
): { schema: string; table: string } | null {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim();
  if (!/^\s*select\b/i.test(cleaned)) return null;
  if (/\b(join|union|intersect|except)\b/i.test(cleaned)) return null;

  const fromMatch = cleaned.match(
    /\bfrom\s+(?:(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][\w$]*))\s*\.\s*)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][\w$]*))/i,
  );
  if (!fromMatch) return null;

  const schema =
    fromMatch[1] || fromMatch[2] || fromMatch[3] || fromMatch[4] || "main";
  const table =
    fromMatch[5] || fromMatch[6] || fromMatch[7] || fromMatch[8] || "";
  if (!table) return null;
  return { schema, table };
}

export function quoteIdent(name: string, dialect: Dialect): string {
  if (dialect === "mysql") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  // Postgres + SQLite: double-quote identifiers
  return `"${name.replace(/"/g, '""')}"`;
}

export function sqlLiteral(value: unknown, dialect: Dialect): string {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") {
    if (dialect === "postgres" || dialect === "mysql") {
      return value ? "TRUE" : "FALSE";
    }
    return value ? "1" : "0";
  }
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return `'${s.replace(/'/g, "''")}'`;
}

export function buildUpdateSql(opts: {
  dialect: Dialect;
  schema: string;
  table: string;
  setColumn: string;
  newValue: unknown;
  pkColumns: string[];
  pkValues: unknown[];
}): string {
  const tableRef =
    opts.dialect === "sqlite" &&
    (opts.schema === "main" || opts.schema === "")
      ? quoteIdent(opts.table, opts.dialect)
      : `${quoteIdent(opts.schema, opts.dialect)}.${quoteIdent(opts.table, opts.dialect)}`;

  const setClause = `${quoteIdent(opts.setColumn, opts.dialect)} = ${sqlLiteral(opts.newValue, opts.dialect)}`;
  const where = opts.pkColumns
    .map((col, i) => {
      const v = opts.pkValues[i];
      if (v == null) {
        return `${quoteIdent(col, opts.dialect)} IS NULL`;
      }
      return `${quoteIdent(col, opts.dialect)} = ${sqlLiteral(v, opts.dialect)}`;
    })
    .join(" AND ");

  return `UPDATE ${tableRef}\nSET ${setClause}\nWHERE ${where};`;
}

/** Coerce edited text back into a JS value for SQL literal formatting. */
export function parseEditedValue(
  text: string,
  previous: unknown,
): unknown {
  const t = text.trim();
  if (t === "" || /^null$/i.test(t)) return null;
  if (typeof previous === "number") {
    const n = Number(t);
    return Number.isFinite(n) ? n : t;
  }
  if (typeof previous === "boolean") {
    if (/^(true|1|yes)$/i.test(t)) return true;
    if (/^(false|0|no)$/i.test(t)) return false;
  }
  // Strip wrapping quotes if user typed them
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return text;
}
