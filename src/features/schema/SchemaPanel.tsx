import { ChevronRight, RefreshCw, Table2 } from "lucide-react";
import { useState } from "react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import { useWorkspace } from "@/stores/workspace";

export function SchemaPanel() {
  const {
    activeConnId,
    schemas,
    setSchemas,
    setSql,
    setStatus,
    addMessage,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  async function refreshSchemas() {
    if (!activeConnId) return;
    setRefreshing(true);
    try {
      const next = await api.listSchemas(activeConnId);
      setSchemas(next);
      setStatus("Schema refreshed");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setRefreshing(false);
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
            <RefreshCw className="size-3.5" />
            Refresh schemas
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <span className="truncate px-1 text-[11px] text-muted-foreground">
          {schemas.length} schema{schemas.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={refreshing}
          onClick={() => void refreshSchemas()}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-2 text-sm">
          {schemas.map((schema) => {
            const key = schema.name;
            const isOpen = expanded[key] ?? true;
            return (
              <div key={key} className="mb-0.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/40"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [key]: !isOpen }))
                  }
                >
                  <ChevronRight
                    className={`size-3.5 text-muted-foreground transition ${isOpen ? "rotate-90" : ""}`}
                  />
                  <span className="font-medium">{schema.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {schema.children.length}
                  </span>
                </button>
                {isOpen &&
                  schema.children.map((table) => (
                    <button
                      key={`${schema.name}.${table.name}`}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-6 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/40"
                      onClick={() =>
                        void (async () => {
                          try {
                            const desc = await api.describeTable(
                              activeConnId,
                              schema.name,
                              table.name,
                            );
                            const cols = (
                              desc as {
                                columns: {
                                  name: string;
                                  dataType: string;
                                }[];
                              }
                            ).columns
                              .map((c) => c.name)
                              .slice(0, 12)
                              .join(", ");
                            const sql =
                              schema.name === "main"
                                ? `SELECT ${cols || "*"} FROM "${table.name}" LIMIT 100;`
                                : `SELECT ${cols || "*"} FROM "${schema.name}"."${table.name}" LIMIT 100;`;
                            setSql(sql);
                            openArtifact("sql");
                            addMessage({
                              id: `schema-${Date.now()}`,
                              role: "system",
                              content: `Focused ${schema.name}.${table.name}`,
                            });
                            setStatus(`Table ${table.name}`);
                          } catch (e) {
                            setStatus(String(e));
                          }
                        })()
                      }
                    >
                      <Table2 className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-[13px]">{table.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {table.kind}
                      </span>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
