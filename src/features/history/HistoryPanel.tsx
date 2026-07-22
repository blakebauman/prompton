import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Database,
  History,
  Trash2,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { useArtifact } from "@/components/artifact/artifact-context";
import {
  ListPane,
  ListPaneActions,
  ListPaneHeader,
  ListPaneScroll,
  ListPaneTitle,
  ListPaneTitleRow,
} from "@/components/list-pane";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/format";
import { api, isDesktopRequiredError, onEvent } from "@/lib/tauri";
import type { HistoryEntry, HistoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

function KindIcon({ kind }: { kind: HistoryKind }) {
  if (kind === "agent") {
    return <Bot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
}

/** Query / agent history — list+detail over on-disk history.json. */
export function HistoryPanel({
  onOpenWorkspace,
}: {
  onOpenWorkspace?: () => void;
} = {}) {
  const { setStatus, setSql } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    try {
      const list = await api.listHistory(100);
      setEntries(list);
      setSelectedId((prev) => {
        if (prev && list.some((e) => e.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      if (!isDesktopRequiredError(e)) setStatus(String(e));
    }
  }, [setStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await onEvent("history:updated", () => {
        void refresh();
      });
    })();
    return () => unlisten?.();
  }, [refresh]);

  async function clearAll() {
    try {
      await api.clearHistory();
      setEntries([]);
      setSelectedId(null);
    } catch (e) {
      if (!isDesktopRequiredError(e)) setStatus(String(e));
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteHistory(id);
      await refresh();
    } catch (e) {
      if (!isDesktopRequiredError(e)) setStatus(String(e));
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[320px] shrink-0">
        <ListPane>
          <ListPaneHeader>
            <ListPaneTitleRow className="mb-1">
              <ListPaneTitle>History</ListPaneTitle>
              {entries.length > 0 && (
                <ListPaneActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => void clearAll()}
                  >
                    Clear
                  </Button>
                </ListPaneActions>
              )}
            </ListPaneTitleRow>
            <p className="px-0.5 text-[11px] text-muted-foreground">
              Recent queries and agent runs
            </p>
          </ListPaneHeader>
          <ListPaneScroll className="pt-24">
            <div className="space-y-0.5 px-1">
              {entries.length === 0 ? (
                <EmptyState
                  dashed
                  className="min-h-40 p-4"
                  icon={<History className="size-8" />}
                  title="No history yet"
                  description="Runs from Chat and SQL will show up here."
                />
              ) : (
                entries.map((e) => {
                  const active = selectedId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
                        active
                          ? "border-border bg-muted/70"
                          : "border-transparent hover:bg-muted/30",
                      )}
                      onClick={() => setSelectedId(e.id)}
                    >
                      <KindIcon kind={e.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="capitalize">{e.kind}</span>
                          <span aria-hidden>·</span>
                          <span className="shrink-0 tabular-nums">
                            {formatWhen(e.createdAt)}
                          </span>
                          {e.connName && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">{e.connName}</span>
                            </>
                          )}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[13px] font-medium leading-snug">
                          {e.title}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </ListPaneScroll>
        </ListPane>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden border-l border-border/60">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background to-transparent" />
        {selected ? (
          <>
            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-6 pt-5">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  <span className="capitalize">{selected.kind}</span>
                  {selected.connName ? ` · ${selected.connName}` : ""}
                  {" · "}
                  {formatWhen(selected.createdAt)}
                  {selected.meta?.durationMs != null && (
                    <> · {String(selected.meta.durationMs)}ms</>
                  )}
                  {selected.meta?.totalRows != null && (
                    <> · {String(selected.meta.totalRows)} rows</>
                  )}
                </p>
                <h2 className="mt-1 truncate text-xl font-bold tracking-tight">
                  {selected.title}
                </h2>
              </div>
              <div className="flex shrink-0 gap-1">
                {selected.kind === "query" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSql(selected.body);
                      openArtifact("sql");
                      onOpenWorkspace?.();
                      setStatus("SQL loaded from history");
                    }}
                  >
                    Load SQL
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => void remove(selected.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="h-full space-y-4 overflow-y-auto px-6 pt-20 pb-8">
              <pre className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/25 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {selected.body}
              </pre>
              {selected.detail && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    Response
                  </h3>
                  <pre className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/15 p-4 text-xs leading-relaxed">
                    {selected.detail}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0 z-20 px-6 pt-5">
              <h2 className="text-xl font-bold tracking-tight">Run detail</h2>
            </div>
            <div className="h-full px-6 pt-16">
              <EmptyState
                title="Select a run"
                description="Pick a query or agent transcript from the list."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
