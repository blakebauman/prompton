import type { QueryColumn, QueryPage } from "@/lib/types";

/** Escape a single CSV field (RFC 4180-ish). Null → empty. */
export function escapeCsvField(value: unknown): string {
  if (value == null) return "";
  const s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function resultsToCsv(
  columns: QueryColumn[],
  rows: unknown[][],
): string {
  const header = columns.map((c) => escapeCsvField(c.name)).join(",");
  const body = rows
    .map((row) =>
      columns.map((_, i) => escapeCsvField(row[i])).join(","),
    )
    .join("\n");
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

export function resultsToJson(
  columns: QueryColumn[],
  rows: unknown[][],
): string {
  const objects = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]?.name ?? `col_${i}`] = row[i] ?? null;
    }
    return obj;
  });
  return `${JSON.stringify(objects, null, 2)}\n`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime: string,
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(ext: "csv" | "json"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `prompton-results-${stamp}.${ext}`;
}

/** How many rows are already buffered client-side. */
export function loadedRowCount(result: QueryPage): number {
  return result.rows.length;
}
