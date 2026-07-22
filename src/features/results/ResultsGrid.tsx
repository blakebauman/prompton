import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartColumn,
  Download,
  FileCode2,
  FileJson,
  Play,
  Table2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { EmptyState } from "@/components/empty-state";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadTextFile,
  exportFilename,
  loadedRowCount,
  resultsToCsv,
  resultsToJson,
} from "@/lib/export-results";
import {
  buildUpdateSql,
  parseEditedValue,
  parseSimpleSelectTarget,
} from "@/lib/sql-edit";
import { api } from "@/lib/tauri";
import type {
  PendingConfirmation,
  QueryPage,
  TableDescription,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

const PAGE = 200;
const EXPORT_PAGE = 500;

type CellKey = string;
type ExportScope = "all" | "loaded" | "selection";

function cellKey(row: number, col: number): CellKey {
  return `${row}:${col}`;
}

export function ResultsGrid() {
  const {
    result,
    setResult,
    setStatus,
    setSql,
    activeConnId,
    connections,
    running,
    setRunning,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const parentRef = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<CellKey>>(() => new Set());
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    draft: string;
  } | null>(null);
  const [tableMeta, setTableMeta] = useState<TableDescription | null>(null);
  const [pendingWrite, setPendingWrite] = useState<PendingConfirmation | null>(
    null,
  );
  const [pendingEdit, setPendingEdit] = useState<{
    row: number;
    col: number;
    value: unknown;
  } | null>(null);

  const active = connections.find((c) => c.id === activeConnId);
  const rowCount = result?.totalRows ?? 0;
  const columns = result?.columns ?? [];
  const target = useMemo(
    () => (result ? parseSimpleSelectTarget(result.sql) : null),
    [result],
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
    setEditing(null);
    setTableMeta(null);
    setPendingWrite(null);
    setPendingEdit(null);
  }, [result?.queryId]);

  useEffect(() => {
    if (!activeConnId || !target) {
      setTableMeta(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const desc = await api.describeTable(
          activeConnId,
          target.schema,
          target.table,
        );
        if (!cancelled) setTableMeta(desc);
      } catch {
        if (!cancelled) setTableMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConnId, target?.schema, target?.table]);

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

  const pkColumns = useMemo(
    () =>
      tableMeta?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name) ?? [],
    [tableMeta],
  );

  const canEdit = Boolean(
    activeConnId &&
      target &&
      tableMeta &&
      pkColumns.length > 0 &&
      pkColumns.every((pk) => columns.some((c) => c.name === pk)),
  );

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
    } catch {
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

  function rowsForScope(page: QueryPage, scope: ExportScope): unknown[][] {
    if (scope === "loaded") return page.rows;
    if (scope === "selection") {
      const rowIdx = new Set<number>();
      for (const key of selected) {
        const row = Number(key.split(":")[0]);
        if (Number.isFinite(row)) rowIdx.add(row);
      }
      return [...rowIdx]
        .sort((a, b) => a - b)
        .map((i) => page.rows[i])
        .filter(Boolean) as unknown[][];
    }
    return page.rows;
  }

  async function exportResults(format: "csv" | "json", scope: ExportScope) {
    if (!result) return;
    if (scope === "selection" && selected.size === 0) {
      setStatus("Select one or more cells to export");
      return;
    }
    setExporting(true);
    try {
      const page =
        scope === "all" ? await ensureAllRows(result) : result;
      const rows = rowsForScope(page, scope);
      if (rows.length === 0) {
        setStatus("Nothing to export");
        return;
      }
      if (format === "csv") {
        downloadTextFile(
          exportFilename("csv"),
          resultsToCsv(page.columns, rows),
          "text/csv;charset=utf-8",
        );
      } else {
        downloadTextFile(
          exportFilename("json"),
          resultsToJson(page.columns, rows),
          "application/json;charset=utf-8",
        );
      }
      const label =
        scope === "all"
          ? "all rows"
          : scope === "loaded"
            ? "loaded rows"
            : "selection";
      setStatus(
        `Exported ${rows.length.toLocaleString()} ${label} as ${format.toUpperCase()}`,
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setExporting(false);
    }
  }

  function selectCell(
    row: number,
    col: number,
    e: React.MouseEvent,
  ) {
    if (e.shiftKey && anchor) {
      const next = new Set<CellKey>();
      const r0 = Math.min(anchor.row, row);
      const r1 = Math.max(anchor.row, row);
      const c0 = Math.min(anchor.col, col);
      const c1 = Math.max(anchor.col, col);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) next.add(cellKey(r, c));
      }
      setSelected(next);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        const key = cellKey(row, col);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setAnchor({ row, col });
      return;
    }
    setSelected(new Set([cellKey(row, col)]));
    setAnchor({ row, col });
  }

  function beginEdit(row: number, col: number) {
    if (!result || !canEdit) {
      if (result && !canEdit) {
        setStatus(
          target
            ? "Cell edit needs a single-table SELECT with primary key columns in the result"
            : "Cell edit works on simple single-table SELECT results",
        );
      }
      return;
    }
    const colName = columns[col]?.name;
    if (colName && pkColumns.includes(colName)) {
      setStatus("Primary key cells are read-only");
      return;
    }
    const value = result.rows[row]?.[col];
    setEditing({
      row,
      col,
      draft: value == null ? "" : String(value),
    });
  }

  async function commitEdit() {
    if (!editing || !result || !activeConnId || !active || !target || !tableMeta)
      return;
    const { row, col, draft } = editing;
    const prev = result.rows[row]?.[col];
    const nextVal = parseEditedValue(draft, prev);
    setEditing(null);

    const same =
      (prev == null && nextVal == null) ||
      String(prev ?? "") === String(nextVal ?? "");
    if (same) return;

    const colName = columns[col]?.name;
    if (!colName) return;

    const pkValues = pkColumns.map((pk) => {
      const idx = columns.findIndex((c) => c.name === pk);
      return result.rows[row]?.[idx];
    });

    const sql = buildUpdateSql({
      dialect: active.dialect,
      schema: target.schema,
      table: target.table,
      setColumn: colName,
      newValue: nextVal,
      pkColumns,
      pkValues,
    });

    try {
      const staged = await api.requestWriteApproval(activeConnId, sql);
      setPendingEdit({ row, col, value: nextVal });
      setPendingWrite(staged);
    } catch (e) {
      setStatus(String(e));
    }
  }

  async function resolveWrite(approved: boolean) {
    if (!pendingWrite) return;
    const id = pendingWrite.confirmationId;
    const edit = pendingEdit;
    setPendingWrite(null);
    if (!approved) {
      await api.confirmWrite(id, false);
      setPendingEdit(null);
      setStatus("Edit rejected");
      return;
    }
    setRunning(true);
    try {
      const page = await api.confirmWrite(id, true);
      if (edit && result) {
        const rows = result.rows.map((r, i) =>
          i === edit.row
            ? r.map((cell, j) => (j === edit.col ? edit.value : cell))
            : r,
        );
        setResult({ ...result, rows });
      }
      setStatus(
        page
          ? `Updated · ${page.affectedRows ?? 1} row · ${page.durationMs}ms`
          : "Updated",
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setPendingEdit(null);
      setRunning(false);
    }
  }

  if (!result) {
    return (
      <EmptyState
        dashed
        title="No results yet"
        description="Run a query from SQL, ask in chat, or list tables to get started."
        actions={
          <>
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
          </>
        }
      />
    );
  }

  const rows = result.rows;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate px-1">
          <span className="font-medium text-foreground">
            {result.totalRows.toLocaleString()}
          </span>{" "}
          rows
          {result.truncated ? " · truncated" : ""}
          {" · "}
          {result.durationMs}ms
          {result.affectedRows != null
            ? ` · ${result.affectedRows} affected`
            : ""}
          {loadedRowCount(result) < result.totalRows
            ? ` · ${loadedRowCount(result).toLocaleString()} loaded`
            : ""}
          {selected.size > 0
            ? ` · ${selected.size} cell${selected.size === 1 ? "" : "s"} selected`
            : ""}
          {canEdit ? " · double-click to edit" : ""}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={result.totalRows === 0}
            onClick={() => openArtifact("chart")}
          >
            <ChartColumn className="size-3.5" />
            Chart
          </Button>
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
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem
                onClick={() => void exportResults("csv", "all")}
              >
                <Table2 className="size-3.5" />
                CSV · all rows
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void exportResults("csv", "loaded")}
              >
                <Table2 className="size-3.5" />
                CSV · loaded
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selected.size === 0}
                onClick={() => void exportResults("csv", "selection")}
              >
                <Table2 className="size-3.5" />
                CSV · selection
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void exportResults("json", "all")}
              >
                <FileJson className="size-3.5" />
                JSON · all rows
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void exportResults("json", "loaded")}
              >
                <FileJson className="size-3.5" />
                JSON · loaded
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selected.size === 0}
                onClick={() => void exportResults("json", "selection")}
              >
                <FileJson className="size-3.5" />
                JSON · selection
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
          <div className="sticky top-0 z-10 flex border-b border-border/60 bg-muted/50 backdrop-blur">
            {columns.map((c) => (
              <div
                key={c.name}
                className="w-40 shrink-0 truncate border-r border-border/50 px-2 py-1.5 font-medium"
                title={`${c.name} (${c.dataType})`}
              >
                {c.name}
                {pkColumns.includes(c.name) ? (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    PK
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            return (
              <div
                key={vRow.key}
                className="absolute left-0 flex border-b border-border/60"
                style={{
                  transform: `translateY(${vRow.start + 32}px)`,
                  height: vRow.size,
                }}
              >
                {columns.map((c, i) => {
                  const key = cellKey(vRow.index, i);
                  const isSelected = selected.has(key);
                  const isEditing =
                    editing?.row === vRow.index && editing.col === i;
                  return (
                    <div
                      key={c.name}
                      className={cn(
                        "w-40 shrink-0 border-r border-border/40 px-2 py-1.5",
                        isSelected &&
                          "bg-foreground/[0.07] outline outline-1 -outline-offset-1 outline-foreground/20",
                        !isSelected && "hover:bg-muted/50",
                        row && isNullCell(row[i]) && !isEditing
                          ? "italic text-muted-foreground/70"
                          : "",
                        canEdit &&
                          !pkColumns.includes(c.name) &&
                          "cursor-text",
                      )}
                      title={row ? String(row[i] ?? "") : ""}
                      onClick={(e) => selectCell(vRow.index, i, e)}
                      onDoubleClick={() => beginEdit(vRow.index, i)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="h-full w-full bg-transparent outline-none"
                          value={editing.draft}
                          onChange={(e) =>
                            setEditing({ ...editing, draft: e.target.value })
                          }
                          onBlur={() => void commitEdit()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitEdit();
                            } else if (e.key === "Escape") {
                              setEditing(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : row ? (
                        <span className="block truncate">
                          {formatCell(row[i])}
                        </span>
                      ) : loadingMore ? (
                        "…"
                      ) : (
                        ""
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <WriteConfirmDialog
        open={!!pendingWrite}
        sql={pendingWrite?.sql ?? ""}
        reason={pendingWrite?.reason}
        isProduction={pendingWrite?.isProduction}
        adminWritesUnlocked={pendingWrite?.adminWritesUnlocked}
        onReject={() => void resolveWrite(false)}
        onApprove={() => void resolveWrite(true)}
      />
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
