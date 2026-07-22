import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { Download, FileCode2, FileJson, Play, Table2 } from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadTextFile,
  exportFilename,
  loadedRowCount,
  resultsToCsv,
  resultsToJson,
} from "@/lib/export-results";
import { api } from "@/lib/tauri";
import type { QueryPage } from "@/lib/types";
import { useWorkspace } from "@/stores/workspace";

const PAGE = 200;
const EXPORT_PAGE = 500;

export function ResultsGrid() {
  const {
    result,
    setResult,
    setStatus,
    setSql,
    activeConnId,
    running,
    setRunning,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const parentRef = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rowCount = result?.totalRows ?? 0;
  const columns = result?.columns ?? [];

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  useEffect(() => {
    if (!result) return;
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    if (!last) return;
    const loaded = result.offset + result.rows.length;
    if (last.index >= loaded - 20 && loaded < result.totalRows && !loadingMore) {
      setLoadingMore(true);
      void api
        .fetchQueryPage(result.queryId, loaded, PAGE)
        .then((page) => {
          setResult({
            ...result,
            rows: [...result.rows, ...page.rows],
            offset: 0,
            limit: result.rows.length + page.rows.length,
          });
        })
        .catch((e) => setStatus(String(e)))
        .finally(() => setLoadingMore(false));
    }
  }, [virtualizer.getVirtualItems(), result, loadingMore, setResult, setStatus]);

  async function runSample() {
    if (!activeConnId) {
      setStatus("Connect a database first (try Open demo SQLite)");
      return;
    }
    const sql =
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;";
    setSql(sql);
    setRunning(true);
    try {
      const page = await api.runQuery({
        connId: activeConnId,
        sql,
        pageSize: 500,
      });
      setResult(page);
      setStatus(`Done · ${page.totalRows} rows · ${page.durationMs}ms`);
    } catch (e) {
      try {
        const page = await api.runQuery({
          connId: activeConnId,
          sql: "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') LIMIT 100;",
          pageSize: 500,
        });
        setResult(page);
        setStatus(`Done · ${page.totalRows} rows · ${page.durationMs}ms`);
      } catch (e2) {
        setStatus(String(e2));
      }
    } finally {
      setRunning(false);
    }
  }

  async function ensureAllRows(page: QueryPage): Promise<QueryPage> {
    let rows = [...page.rows];
    let offset = loadedRowCount(page);
    while (offset < page.totalRows) {
      const next = await api.fetchQueryPage(
        page.queryId,
        offset,
        EXPORT_PAGE,
      );
      if (next.rows.length === 0) break;
      rows = [...rows, ...next.rows];
      offset = rows.length;
      setStatus(
        `Loading for export… ${offset.toLocaleString()} / ${page.totalRows.toLocaleString()}`,
      );
    }
    const full: QueryPage = {
      ...page,
      rows,
      offset: 0,
      limit: rows.length,
    };
    setResult(full);
    return full;
  }

  async function exportResults(format: "csv" | "json") {
    if (!result) return;
    setExporting(true);
    try {
      const full = await ensureAllRows(result);
      if (format === "csv") {
        downloadTextFile(
          exportFilename("csv"),
          resultsToCsv(full.columns, full.rows),
          "text/csv;charset=utf-8",
        );
      } else {
        downloadTextFile(
          exportFilename("json"),
          resultsToJson(full.columns, full.rows),
          "application/json;charset=utf-8",
        );
      }
      setStatus(
        `Exported ${full.rows.length.toLocaleString()} rows as ${format.toUpperCase()}`,
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setExporting(false);
    }
  }

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="mx-auto max-w-sm space-y-3 rounded-2xl border-2 border-dashed border-muted px-6 py-10">
          <h3 className="text-sm font-medium">No results yet</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Run a query from SQL, ask in chat, or list tables to get started.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openArtifact("sql")}
            >
              <FileCode2 className="size-3.5" />
              Open SQL
            </Button>
            <Button
              size="sm"
              disabled={!activeConnId || running}
              onClick={() => void runSample()}
            >
              <Play className="size-3.5" />
              List tables
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const rows = result.rows;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">
            {result.totalRows.toLocaleString()}
          </span>{" "}
          rows
          {result.truncated ? " · truncated" : ""}
          <span className="text-muted-foreground/70">
            {" "}
            · {result.durationMs}ms
            {result.affectedRows != null
              ? ` · ${result.affectedRows} affected`
              : ""}
            {loadedRowCount(result) < result.totalRows
              ? ` · ${loadedRowCount(result).toLocaleString()} loaded`
              : ""}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={exporting || result.totalRows === 0}
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void exportResults("csv")}>
                <Table2 className="size-3.5" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportResults("json")}>
                <FileJson className="size-3.5" />
                JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {running && result.queryId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void api
                  .cancelQuery(result.queryId)
                  .catch((e) => setStatus(String(e)))
              }
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs"
      >
        <div
          style={{
            height: virtualizer.getTotalSize() + 32,
            width: "max-content",
            minWidth: "100%",
            position: "relative",
          }}
        >
          <div className="sticky top-0 z-10 flex border-b bg-muted/80 backdrop-blur">
            {columns.map((c) => (
              <div
                key={c.name}
                className="w-40 shrink-0 truncate border-r px-2 py-1.5 font-medium"
                title={`${c.name} (${c.dataType})`}
              >
                {c.name}
              </div>
            ))}
          </div>
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            return (
              <div
                key={vRow.key}
                className="absolute left-0 flex border-b border-border/60 hover:bg-accent/40"
                style={{
                  transform: `translateY(${vRow.start + 32}px)`,
                  height: vRow.size,
                }}
              >
                {columns.map((c, i) => (
                  <div
                    key={c.name}
                    className={
                      row && isNullCell(row[i])
                        ? "w-40 shrink-0 truncate border-r px-2 py-1.5 italic text-muted-foreground/70"
                        : "w-40 shrink-0 truncate border-r px-2 py-1.5"
                    }
                    title={row ? String(row[i] ?? "") : ""}
                  >
                    {row ? formatCell(row[i]) : loadingMore ? "…" : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function isNullCell(value: unknown): boolean {
  return value == null;
}
