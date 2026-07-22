/** Lightweight SQL pretty-printer for the editor toolbar (no parser). */
export function formatSql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) return sql;

  const keywords =
    /\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|CROSS\s+JOIN|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION(?:\s+ALL)?|INSERT\s+INTO|UPDATE|DELETE\s+FROM|SET|VALUES|WITH|RETURNING|AS)\b/gi;

  let out = trimmed.replace(/\s+/g, " ");
  out = out.replace(keywords, (match) => `\n${match.toUpperCase()}`);
  out = out.replace(/,\s*/g, ",\n  ");
  out = out.replace(/^\n+/, "");
  // Indent continuation lines under SELECT lists / clauses.
  return out
    .split("\n")
    .map((line, i) => {
      const t = line.trim();
      if (!t) return "";
      if (i === 0) return t;
      if (/^(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION|INSERT|UPDATE|DELETE|SET|VALUES|WITH|RETURNING|AND|OR|ON)\b/i.test(t)) {
        return t;
      }
      return `  ${t}`;
    })
    .filter(Boolean)
    .join("\n");
}
