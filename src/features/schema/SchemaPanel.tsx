import { useMemo, useState } from "react";
import {
  ChevronRight,
  Columns3,
  Copy,
  FileCode2,
  KeyRound,
  Play,
  RefreshCw,
  Table2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { EmptyState } from "@/components/empty-state";
import { ListPaneSearch } from "@/components/list-pane";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  handleMaybeLostConnection,
  isConnectionLostError,
} from "@/lib/connection-health";
import {
  isQueryCancelled,
  runCancellableQuery,
} from "@/lib/run-query";
import { api } from "@/lib/tauri";
import type { ColumnInfo, SchemaNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

function buildSelectSql(
  schema: string,
  table: string,
  columns: string[],
): string {
  const cols = columns.slice(0, 12).join(", ") || "*";
  return schema === "main"
    ? `SELECT ${cols} FROM "${table}" LIMIT 100;`
    : `SELECT ${cols} FROM "${schema}"."${table}" LIMIT 100;`;
}

function qualifiedName(schema: string, table: string): string {
  return schema === "main" ? table : `${schema}.${table}`;
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

/** Schema browser — searchable tree with table columns, preview / SQL actions. */
export function SchemaPanel() {
  const {
    activeConnId,
    schemas,
    setSchemas,
    setSql,
    setStatus,
    setResult,
    addMessage,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [expandedSchemas, setExpandedSchemas] = useState<
    Record<string, boolean>
  >({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>(
    {},
  );
  const [columnsByTable, setColumnsByTable] = useState<
    Record<string, ColumnInfo[]>
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
          const cols = columnsByTable[id];
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
  }, [schemas, query, columnsByTable]);

  const tableCount = useMemo(
    () => schemas.reduce((n, s) => n + s.children.length, 0),
    [schemas],
  );

  async function refreshSchemas() {
    if (!activeConnId) return;
    setRefreshing(true);
    try {
      const next = await api.listSchemas(activeConnId);
      setSchemas(next);
      setColumnsByTable({});
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

  async function ensureColumns(schema: string, table: string) {
    const id = tableKey(schema, table);
    if (columnsByTable[id] || !activeConnId) return columnsByTable[id];
    setLoadingColumns((s) => ({ ...s, [id]: true }));
    try {
      const desc = await api.describeTable(activeConnId, schema, table);
      setColumnsByTable((s) => ({ ...s, [id]: desc.columns }));
      return desc.columns;
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
    if (open) await ensureColumns(schema, table);
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
      const cols =
        (await ensureColumns(schema.name, table.name))?.map((c) => c.name) ??
        [];
      const nextSql = buildSelectSql(schema.name, table.name, cols);
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

  function insertColumnSql(schema: string, table: string, column: string) {
    setSql(buildSelectSql(schema, table, [column]));
    openArtifact("sql");
    setStatus(`SQL · ${column}`);
    toast({
      title: "Inserted into SQL",
      description: `${qualifiedName(schema, table)}.${column}`,
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
              description="Try a different table, schema, or loaded column name."
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
                    const cols = columnsByTable[id];
                    const colsLoading = !!loadingColumns[id];
                    return (
                      <div key={id}>
                        <div className="group flex items-center gap-0.5 rounded-md pr-1 pl-4 hover:bg-muted/40">
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
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground capitalize">
                              {table.kind}
                            </span>
                          </button>
                          <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Columns"
                              aria-label={`Columns for ${table.name}`}
                              onClick={() =>
                                void toggleTableColumns(
                                  schema.name,
                                  table.name,
                                )
                              }
                            >
                              <Columns3 className="size-3" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Preview"
                              aria-label={`Preview ${table.name}`}
                              disabled={busy}
                              onClick={() =>
                                void loadTable(schema, table, "preview")
                              }
                            >
                              <Play className="size-3" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Open in SQL"
                              aria-label={`Open ${table.name} in SQL`}
                              disabled={busy}
                              onClick={() =>
                                void loadTable(schema, table, "sql")
                              }
                            >
                              <FileCode2 className="size-3" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Copy name"
                              aria-label={`Copy ${table.name}`}
                              onClick={() =>
                                void copyText(
                                  qualifiedName(schema.name, table.name),
                                  qualifiedName(schema.name, table.name),
                                )
                              }
                            >
                              <Copy className="size-3" />
                            </Button>
                          </div>
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
                            {cols?.map((col) => (
                              <div
                                key={col.name}
                                className="group/col flex items-center gap-1 rounded-md pr-1 hover:bg-muted/35"
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
                                    title="Insert into SQL"
                                    aria-label={`Insert ${col.name} into SQL`}
                                    onClick={() =>
                                      insertColumnSql(
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
                                      void copyText(col.name, col.name)
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
