import { useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  FileCode2,
  Play,
  RefreshCw,
  Table2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { EmptyState } from "@/components/empty-state";
import { ListPaneSearch } from "@/components/list-pane";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/tauri";
import type { SchemaNode } from "@/lib/types";
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

/** Schema browser — searchable tree with preview / SQL actions. */
export function SchemaPanel() {
  const {
    activeConnId,
    schemas,
    setSchemas,
    setSql,
    setStatus,
    setResult,
    setRunning,
    addMessage,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [busyTable, setBusyTable] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schemas;
    return schemas
      .map((schema) => ({
        ...schema,
        children: schema.children.filter((t) =>
          `${schema.name}.${t.name}`.toLowerCase().includes(q),
        ),
      }))
      .filter((schema) => schema.children.length > 0);
  }, [schemas, query]);

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
      setStatus("Schema refreshed");
      toast({ title: "Schema refreshed", tone: "success" });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setRefreshing(false);
    }
  }

  function setAllExpanded(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const schema of schemas) next[schema.name] = open;
    setExpanded(next);
  }

  async function loadTable(
    schema: SchemaNode,
    table: SchemaNode,
    mode: "preview" | "sql",
  ) {
    if (!activeConnId) return;
    const key = `${schema.name}.${table.name}`;
    setBusyTable(key);
    try {
      const desc = await api.describeTable(
        activeConnId,
        schema.name,
        table.name,
      );
      const cols = desc.columns.map((c) => c.name);
      const sql = buildSelectSql(schema.name, table.name, cols);
      setSql(sql);
      addMessage({
        id: `schema-${Date.now()}`,
        role: "system",
        content: `Focused ${qualifiedName(schema.name, table.name)}`,
      });

      if (mode === "sql") {
        openArtifact("sql");
        setStatus(`SQL ready · ${table.name}`);
        return;
      }

      setRunning(true);
      setStatus(`Previewing ${table.name}…`);
      const page = await api.runQuery({
        connId: activeConnId,
        sql,
        pageSize: 100,
      });
      setResult(page);
      openArtifact("results");
      setStatus(
        `Preview · ${page.totalRows.toLocaleString()} rows · ${page.durationMs}ms`,
      );
    } catch (e) {
      setStatus(String(e));
      toast({
        title: "Couldn’t load table",
        description: String(e),
        tone: "error",
      });
    } finally {
      setBusyTable(null);
      setRunning(false);
    }
  }

  async function copyTableName(schema: string, table: string) {
    const name = qualifiedName(schema, table);
    try {
      await navigator.clipboard.writeText(name);
      toast({ title: "Copied", description: name, tone: "success" });
    } catch {
      toast({
        title: "Couldn’t copy",
        description: name,
        tone: "error",
      });
    }
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
            size="sm"
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
            onClick={() => setAllExpanded(true)}
          >
            Expand
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setAllExpanded(false)}
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
            placeholder="Filter tables…"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5 p-1.5">
          {filtered.length === 0 && (
            <EmptyState
              className="min-h-32 p-4"
              title="No matches"
              description="Try a different table or schema name."
            />
          )}
          {filtered.map((schema) => {
            const key = schema.name;
            const isOpen = expanded[key] ?? true;
            return (
              <div key={key}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/40 focus-visible:outline-none"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [key]: !isOpen }))
                  }
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span className="truncate text-[13px] font-medium">
                    {schema.name}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {schema.children.length}
                  </span>
                </button>
                {isOpen &&
                  schema.children.map((table) => {
                    const id = `${schema.name}.${table.name}`;
                    const busy = busyTable === id;
                    return (
                      <div
                        key={id}
                        className="group flex items-center gap-0.5 rounded-md pr-1 pl-5 hover:bg-muted/40"
                      >
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
                              void copyTableName(schema.name, table.name)
                            }
                          >
                            <Copy className="size-3" />
                          </Button>
                        </div>
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
