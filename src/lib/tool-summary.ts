import type { ToolState } from "@/components/ai-elements/tool";
import type { TableDescription } from "@/lib/types";

/** Map a tool result string to the card status badge. */
export function toolResultState(result: string): ToolState {
  const text = result.trim();
  if (text.startsWith("Error:") || text.startsWith("Write could not be executed")) {
    return "output-error";
  }
  if (/user rejected the write/i.test(text)) {
    return "output-denied";
  }
  return "output-available";
}

export type ToolSummary = {
  /** One-line header under the tool name. */
  subtitle?: string;
  /** Prefer structured body over raw JSON dump. */
  kind?: "schema" | "rows" | "text";
  schema?: {
    table?: string;
    schema?: string;
    columns: Array<{ name: string; dataType: string; isPrimaryKey: boolean }>;
    estimatedRows?: number | null;
  };
  rowsPreview?: {
    columns: string[];
    rows: string[][];
    omitted?: number;
  };
};

/** Compact, scan-friendly summary for tool card headers / bodies. */
export function summarizeToolResult(
  toolName: string | undefined,
  content: string,
  args?: unknown,
): ToolSummary {
  const text = content.trim();
  if (!text) return {};

  if (toolName === "inspect_schema") {
    const schema = tryParseTableDescription(text);
    if (schema) {
      const pk = schema.columns
        .filter((c) => c.isPrimaryKey)
        .map((c) => c.name);
      const table = [schema.schema, schema.table].filter(Boolean).join(".");
      const parts = [
        table || "table",
        `${schema.columns.length} col${schema.columns.length === 1 ? "" : "s"}`,
      ];
      if (pk.length) parts.push(`PK ${pk.join(", ")}`);
      if (schema.estimatedRows != null) {
        parts.push(`~${schema.estimatedRows.toLocaleString()} rows`);
      }
      return { subtitle: parts.join(" · "), kind: "schema", schema };
    }
    const tableLines = text.match(/^\s+- .+$/gm);
    if (tableLines?.length) {
      return {
        subtitle: `${tableLines.length} table${tableLines.length === 1 ? "" : "s"}`,
        kind: "text",
      };
    }
  }

  if (toolName === "run_query" || toolName === "sample_rows") {
    const hitl = text.match(
      /Executed after HITL approval\.\s*rows=(\d+),\s*affected=([^,]+),\s*durationMs=(\d+)/i,
    );
    if (hitl) {
      return {
        subtitle: `${Number(hitl[1]).toLocaleString()} rows · ${hitl[3]}ms · approved`,
        kind: "text",
      };
    }
    const rows = parseRowSummary(text);
    if (rows) {
      const shown = rows.rows.length;
      const parts = [
        `${rows.columns.length} col${rows.columns.length === 1 ? "" : "s"}`,
        `${shown} row${shown === 1 ? "" : "s"}`,
      ];
      if (rows.omitted) parts.push(`+${rows.omitted} omitted`);
      const table =
        args &&
        typeof args === "object" &&
        args !== null &&
        "table" in args &&
        typeof (args as { table?: unknown }).table === "string"
          ? (args as { table: string }).table
          : null;
      if (table) parts.unshift(table);
      return { subtitle: parts.join(" · "), kind: "rows", rowsPreview: rows };
    }
  }

  if (toolName === "list_tables") {
    const tableLines = text.match(/^\s+- .+$/gm);
    if (tableLines?.length) {
      return {
        subtitle: `${tableLines.length} table${tableLines.length === 1 ? "" : "s"}`,
        kind: "text",
      };
    }
  }

  if (toolName === "explain_query") {
    const first = text.split("\n").find((l) => l.trim());
    if (first) {
      return {
        subtitle: first.trim().replace(/\s+/g, " ").slice(0, 120),
        kind: "text",
      };
    }
  }

  return {};
}

function tryParseTableDescription(text: string): ToolSummary["schema"] | null {
  try {
    const desc = JSON.parse(text) as TableDescription;
    if (!desc || !Array.isArray(desc.columns)) return null;
    return {
      table: desc.table,
      schema: desc.schema,
      columns: desc.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isPrimaryKey: !!c.isPrimaryKey,
      })),
      estimatedRows: desc.estimatedRows ?? null,
    };
  } catch {
    return null;
  }
}

function parseRowSummary(text: string): ToolSummary["rowsPreview"] | null {
  const lines = text.split("\n");
  const colLine = lines.find((l) => l.startsWith("columns:"));
  if (!colLine) return null;
  const columns = colLine
    .slice("columns:".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rows: string[][] = [];
  let omitted: number | undefined;
  for (const line of lines) {
    const m = line.match(/^\d+:\s*(.*)$/);
    if (m) {
      rows.push(m[1].split(" | "));
      continue;
    }
    const more = line.match(/…\s*(\d+)\s+more rows/i);
    if (more) omitted = Number(more[1]);
  }
  if (columns.length === 0 && rows.length === 0) return null;
  return { columns, rows, omitted };
}
