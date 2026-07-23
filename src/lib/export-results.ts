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

function cellTextForClipboard(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Format a cell selection as TSV for paste into spreadsheets.
 * Uses the bounding box of selected keys (`row:col`); unselected cells in
 * the box become empty fields.
 */
export function selectionToTsv(
  rows: unknown[][],
  selected: Iterable<string>,
): string {
  const keys: Array<{ row: number; col: number }> = [];
  for (const key of selected) {
    const [rs, cs] = key.split(":");
    const row = Number(rs);
    const col = Number(cs);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    keys.push({ row, col });
  }
  if (keys.length === 0) return "";

  if (keys.length === 1) {
    const { row, col } = keys[0]!;
    return cellTextForClipboard(rows[row]?.[col]);
  }

  let r0 = Infinity;
  let r1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  const set = new Set<string>();
  for (const { row, col } of keys) {
    set.add(`${row}:${col}`);
    r0 = Math.min(r0, row);
    r1 = Math.max(r1, row);
    c0 = Math.min(c0, col);
    c1 = Math.max(c1, col);
  }

  const lines: string[] = [];
  for (let r = r0; r <= r1; r++) {
    const cells: string[] = [];
    for (let c = c0; c <= c1; c++) {
      if (!set.has(`${r}:${c}`)) {
        cells.push("");
        continue;
      }
      const raw = cellTextForClipboard(rows[r]?.[c]);
      // Escape tabs/newlines so a cell stays one field.
      cells.push(
        /[\t\n\r]/.test(raw)
          ? `"${raw.replace(/"/g, '""')}"`
          : raw,
      );
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
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
