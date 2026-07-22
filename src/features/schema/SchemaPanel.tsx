import { ChevronRight, RefreshCw, Table2 } from "lucide-react";
import { useState } from "react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-1 p-8 text-center">
        <h3 className="text-sm font-medium">No connection</h3>
        <p className="max-w-xs text-sm text-muted-foreground text-pretty">
          Select a connection to browse schemas and tables.
        </p>
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="max-w-xs space-y-1">
          <h3 className="text-sm font-medium">No schema loaded</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Refresh schemas, or ask the agent to inspect them.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={refreshing}
          onClick={() => void refreshSchemas()}
        >
          <RefreshCw className="size-3.5" />
          Refresh schemas
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-end border-b border-border/60 px-2">
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
      <ScrollArea className="flex-1">
        <div className="p-2 text-sm">
          {schemas.map((schema) => {
            const key = schema.name;
            const isOpen = expanded[key] ?? true;
            return (
              <div key={key} className="mb-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-6 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
      </ScrollArea>
    </div>
  );
}
