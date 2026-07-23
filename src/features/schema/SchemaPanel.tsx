import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  FileCode2,
  KeyRound,
  MoreHorizontal,
  Play,
  RefreshCw,
  Table2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { EmptyState } from "@/components/empty-state";
import { ListPaneSearch } from "@/components/list-pane";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import {
  handleMaybeLostConnection,
  isConnectionLostError,
} from "@/lib/connection-health";
import {
  isQueryCancelled,
  runCancellableQuery,
} from "@/lib/run-query";
import { quoteIdent } from "@/lib/sql-edit";
import { api } from "@/lib/tauri";
import type { Dialect, SchemaNode, TableDescription } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

function buildSelectSql(
  schema: string,
  table: string,
  columns: string[],
  dialect: Dialect,
): string {
  const cols = columns.length
    ? columns.slice(0, 12).map((c) => quoteIdent(c, dialect)).join(", ")
    : "*";
  const tableRef =
    schema === "main"
      ? quoteIdent(table, dialect)
      : `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  return `SELECT ${cols} FROM ${tableRef} LIMIT 100;`;
}

function qualifiedName(schema: string, table: string): string {
  return schema === "main" ? table : `${schema}.${table}`;
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

function formatApproxCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return n.toLocaleString();
}

/** Schema browser — searchable tree with table columns, preview / SQL actions. */
export function SchemaPanel() {
  const {
    activeConnId,
    connections,
    schemas,
    setSchemas,
    sql,
    setSql,
    setStatus,
    setResult,
    addMessage,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const dialect: Dialect =
    connections.find((c) => c.id === activeConnId)?.dialect ?? "sqlite";

  const [expandedSchemas, setExpandedSchemas] = useState<
    Record<string, boolean>
  >({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>(
    {},
  );
  const [metaByTable, setMetaByTable] = useState<
    Record<string, TableDescription>
  >({});
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>(
    {},
  );
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [busyTable, setBusyTable] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schemas;
    return schemas
      .map((schema) => ({
        ...schema,
        children: schema.children.filter((t) => {
          const id = tableKey(schema.name, t.name);
          const hay = `${schema.name}.${t.name}`.toLowerCase();
          if (hay.includes(q)) return true;
          const cols = metaByTable[id]?.columns;
          return (
            cols?.some(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.dataType.toLowerCase().includes(q),
            ) ?? false
          );
        }),
      }))
      .filter((schema) => schema.children.length > 0);
  }, [schemas, query, metaByTable]);

  const tableCount = useMemo(
    () => schemas.reduce((n, s) => n + s.children.length, 0),
    [schemas],
  );

  // Keep matching schemas/tables open while filtering.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    setExpandedSchemas((prev) => {
      const next = { ...prev };
      for (const schema of filtered) next[schema.name] = true;
      return next;
    });
    setExpandedTables((prev) => {
      const next = { ...prev };
      for (const schema of filtered) {
        for (const table of schema.children) {
          const id = tableKey(schema.name, table.name);
          const hay = `${schema.name}.${table.name}`.toLowerCase();
          if (hay.includes(q)) continue;
          const cols = metaByTable[id]?.columns;
          if (
            cols?.some(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.dataType.toLowerCase().includes(q),
            )
          ) {
            next[id] = true;
          }
        }
      }
      return next;
    });
  }, [query, filtered, metaByTable]);

  async function refreshSchemas() {
    if (!activeConnId) return;
    setRefreshing(true);
    try {
      const next = await api.listSchemas(activeConnId);
      setSchemas(next);
      setMetaByTable({});
      setExpandedTables({});
      setStatus("Schema refreshed");
      toast({ title: "Schema refreshed", tone: "success" });
    } catch (e) {
      if (await handleMaybeLostConnection(e, activeConnId)) return;
      setStatus(String(e));
      toast({
        title: "Schema refresh failed",
        description: String(e),
        tone: "error",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function setAllSchemasExpanded(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const schema of schemas) next[schema.name] = open;
    setExpandedSchemas(next);
    if (!open) setExpandedTables({});
  }

  async function ensureMeta(schema: string, table: string) {
    const id = tableKey(schema, table);
    if (metaByTable[id] || !activeConnId) return metaByTable[id] ?? null;
    setLoadingColumns((s) => ({ ...s, [id]: true }));
    try {
      const desc = await api.describeTable(activeConnId, schema, table);
      setMetaByTable((s) => ({ ...s, [id]: desc }));
      return desc;
    } catch (e) {
      if (await handleMaybeLostConnection(e, activeConnId)) return null;
      setStatus(String(e));
      toast({
        title: "Couldn’t load columns",
        description: String(e),
        tone: "error",
      });
      return null;
    } finally {
      setLoadingColumns((s) => ({ ...s, [id]: false }));
    }
  }

  async function toggleTableColumns(schema: string, table: string) {
    const id = tableKey(schema, table);
    const open = !(expandedTables[id] ?? false);
    setExpandedTables((s) => ({ ...s, [id]: open }));
    if (open) await ensureMeta(schema, table);
  }

  async function loadTable(
    schema: SchemaNode,
    table: SchemaNode,
    mode: "preview" | "sql",
  ) {
    if (!activeConnId) return;
    const key = tableKey(schema.name, table.name);
    setBusyTable(key);
    try {
      const meta = await ensureMeta(schema.name, table.name);
      const cols = meta?.columns.map((c) => c.name) ?? [];
      const nextSql = buildSelectSql(schema.name, table.name, cols, dialect);
      setSql(nextSql);
      addMessage({
        id: `schema-${Date.now()}`,
        role: "system",
        content: `Focused ${qualifiedName(schema.name, table.name)}`,
      });

      if (mode === "sql") {
        openArtifact("sql");
        setStatus(`SQL ready · ${table.name}`);
        toast({ title: "SQL ready", description: table.name, tone: "success" });
        return;
      }

      setStatus(`Previewing ${table.name}…`);
      const page = await runCancellableQuery({
        connId: activeConnId,
        sql: nextSql,
        pageSize: 100,
      });
      setResult(page);
      openArtifact("results");
      const msg = `Preview · ${page.totalRows.toLocaleString()} rows · ${page.durationMs}ms`;
      setStatus(msg);
      toast({ title: "Preview ready", description: msg, tone: "success" });
    } catch (e) {
      if (isQueryCancelled(e)) {
        setStatus("Query cancelled");
        toast({ title: "Query cancelled" });
        return;
      }
      if (isConnectionLostError(e)) return;
      setStatus(String(e));
      toast({
        title: "Couldn’t load table",
        description: String(e),
        tone: "error",
      });
    } finally {
      setBusyTable(null);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: label, tone: "success" });
    } catch {
      toast({ title: "Couldn’t copy", description: label, tone: "error" });
    }
  }

  /** Append a column identifier into the SQL buffer — never clobber a draft. */
  function appendColumnToSql(schema: string, table: string, column: string) {
    const col = quoteIdent(column, dialect);
    const current = sql.trimEnd();
    let next: string;
    if (!current) {
      next = buildSelectSql(schema, table, [column], dialect);
    } else if (/,\s*$/.test(current) || /\(\s*$/.test(current)) {
      next = `${current}${col}`;
    } else if (/\s$/.test(sql)) {
      next = `${sql}${col}`;
    } else {
      next = `${current}, ${col}`;
    }
    setSql(next);
    openArtifact("sql");
    setStatus(`SQL · appended ${column}`);
    toast({
      title: "Appended to SQL",
      description: col,
      tone: "success",
    });
  }

  if (!activeConnId) {
    return (
      <EmptyState
        title="No connection"
        description="Select a connection to browse schemas and tables."
      />
    );
  }

  if (schemas.length === 0) {
    return (
      <EmptyState
        dashed
        title="No schema loaded"
        description="Refresh schemas, or ask the agent to inspect them."
        actions={
          <Button
            size="xs"
            variant="secondary"
            disabled={refreshing}
            onClick={() => void refreshSchemas()}
          >
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin")}
            />
            Refresh schemas
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <span className="min-w-0 truncate px-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {tableCount.toLocaleString()}
          </span>{" "}
          tables · {schemas.length} schema{schemas.length === 1 ? "" : "s"}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setAllSchemasExpanded(true)}
          >
            Expand
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setAllSchemasExpanded(false)}
          >
            Collapse
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={refreshing}
            onClick={() => void refreshSchemas()}
          >
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      {tableCount > 8 && (
        <div className="border-b border-border/60 px-2 py-1.5">
          <ListPaneSearch
            value={query}
            onChange={setQuery}
            placeholder="Filter tables or columns…"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5 p-1.5">
          {filtered.length === 0 && (
            <EmptyState
              className="min-h-32 p-4"
              title="No matches"
              description="Try a different table or schema name. Expand a table first to filter by column."
            />
          )}
          {filtered.map((schema) => {
            const schemaOpen = expandedSchemas[schema.name] ?? true;
            return (
              <div key={schema.name}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/40 focus-visible:outline-none"
                  onClick={() =>
                    setExpandedSchemas((e) => ({
                      ...e,
                      [schema.name]: !schemaOpen,
                    }))
                  }
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform",
                      schemaOpen && "rotate-90",
                    )}
                  />
                  <span className="truncate text-[13px] font-medium">
                    {schema.name}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {schema.children.length}
                  </span>
                </button>
                {schemaOpen &&
                  schema.children.map((table) => {
                    const id = tableKey(schema.name, table.name);
                    const busy = busyTable === id;
                    const tableOpen = expandedTables[id] ?? false;
                    const meta = metaByTable[id];
                    const cols = meta?.columns;
                    const colsLoading = !!loadingColumns[id];
                    const approx =
                      meta?.estimatedRows != null
                        ? formatApproxCount(meta.estimatedRows)
                        : null;
                    return (
                      <div key={id}>
                        <div className="group flex items-center gap-0.5 rounded-md pr-0.5 pl-4 hover:bg-muted/40">
                          <button
                            type="button"
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            aria-label={
                              tableOpen
                                ? `Collapse columns for ${table.name}`
                                : `Expand columns for ${table.name}`
                            }
                            title="Columns"
                            onClick={() =>
                              void toggleTableColumns(schema.name, table.name)
                            }
                          >
                            <ChevronRight
                              className={cn(
                                "size-3.5 transition-transform",
                                tableOpen && "rotate-90",
                              )}
                            />
                          </button>
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none"
                            disabled={busy}
                            onClick={() =>
                              void loadTable(schema, table, "preview")
                            }
                            title="Preview rows"
                          >
                            <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate text-[12.5px]">
                              {table.name}
                            </span>
                            {approx && (
                              <span
                                className="shrink-0 text-[10px] text-muted-foreground tabular-nums"
                                title={`≈ ${meta?.estimatedRows?.toLocaleString()} rows`}
                              >
                                ~{approx}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground capitalize">
                              {table.kind}
                            </span>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                                aria-label={`Actions for ${table.name}`}
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                disabled={busy}
                                onClick={() =>
                                  void loadTable(schema, table, "preview")
                                }
                              >
                                <Play className="size-3.5" />
                                Preview rows
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={busy}
                                onClick={() =>
                                  void loadTable(schema, table, "sql")
                                }
                              >
                                <FileCode2 className="size-3.5" />
                                Open in SQL
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void toggleTableColumns(
                                    schema.name,
                                    table.name,
                                  )
                                }
                              >
                                <ChevronRight className="size-3.5" />
                                {tableOpen ? "Hide columns" : "Show columns"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  void copyText(
                                    qualifiedName(schema.name, table.name),
                                    qualifiedName(schema.name, table.name),
                                  )
                                }
                              >
                                <Copy className="size-3.5" />
                                Copy name
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {tableOpen && (
                          <div className="mb-0.5 ml-10 space-y-0.5 border-l border-border/50 pl-2">
                            {colsLoading && !cols && (
                              <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
                                Loading columns…
                              </p>
                            )}
                            {cols?.length === 0 && (
                              <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
                                No columns
                              </p>
                            )}
                            {meta?.estimatedRows != null && (
                              <p className="px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                                ≈ {meta.estimatedRows.toLocaleString()} rows
                                (estimate)
                              </p>
                            )}
                            {cols?.map((col) => (
                              <div
                                key={col.name}
                                className="group/col flex items-center gap-1 rounded-md pr-0.5 hover:bg-muted/35"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-0.5">
                                  {col.isPrimaryKey ? (
                                    <KeyRound className="size-3 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <span className="size-3 shrink-0" />
                                  )}
                                  <span className="truncate font-mono text-[11px]">
                                    {col.name}
                                  </span>
                                  <span className="truncate text-[10px] text-muted-foreground">
                                    {col.dataType}
                                    {col.nullable ? "" : " · not null"}
                                    {col.isPrimaryKey ? " · PK" : ""}
                                  </span>
                                </div>
                                <div className="flex shrink-0 opacity-0 transition-opacity group-hover/col:opacity-100 group-focus-within/col:opacity-100">
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    title="Append to SQL"
                                    aria-label={`Append ${col.name} to SQL`}
                                    onClick={() =>
                                      appendColumnToSql(
                                        schema.name,
                                        table.name,
                                        col.name,
                                      )
                                    }
                                  >
                                    <FileCode2 className="size-3" />
                                  </Button>
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    title="Copy column"
                                    aria-label={`Copy ${col.name}`}
                                    onClick={() =>
                                      void copyText(
                                        col.name,
                                        quoteIdent(col.name, dialect),
                                      )
                                    }
                                  >
                                    <Copy className="size-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
