/** Keywords that mutate data/schema or run transactional/admin side effects. */
const WRITE_KEYWORDS = new Set([
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "MERGE",
  "UPSERT",
  "CREATE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "CALL",
  "DO",
  "VACUUM",
  "REINDEX",
  "ATTACH",
  "DETACH",
  "REFRESH",
  "COMMENT",
  "SECURITY",
  "SET",
  "RESET",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
  "LOCK",
  "UNLOCK",
]);

const READ_KEYWORDS = new Set([
  "SELECT",
  "SHOW",
  "EXPLAIN",
  "DESCRIBE",
  "DESC",
  "PRAGMA",
  "VALUES",
  "WITH",
]);

/** Strip comments and literals so keyword scans ignore noise (mirrors Rust). */
export function stripSqlNoise(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n") i += 1;
      out += " ";
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        i += 1;
      }
      i = Math.min(i + 2, sql.length);
      out += " ";
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += " ";
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function sqlTokens(upper: string): string[] {
  return upper.split(/[^A-Z0-9_]+/).filter(Boolean);
}

/**
 * True when SQL may mutate data/schema or run side effects.
 * Closes the `WITH … INSERT/UPDATE/DELETE` HITL bypass.
 */
export function isMutatingSql(sql: string): boolean {
  const upper = stripSqlNoise(sql).trim().toUpperCase();
  if (!upper) return false;
  const tokens = sqlTokens(upper);
  const first = tokens[0] ?? "";

  if (WRITE_KEYWORDS.has(first)) return true;
  if (READ_KEYWORDS.has(first) && first !== "WITH") return false;
  if (first === "WITH") {
    return tokens.some((t) => WRITE_KEYWORDS.has(t));
  }
  return true;
}
