import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Copy,
  Database,
  FileCode2,
  History,
  ListFilter,
  MessageSquarePlus,
  Play,
  Trash2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import {
  DetailPane,
  DetailPaneActions,
  DetailPaneHeader,
  DetailPaneMeta,
  DetailPaneScroll,
  DetailPaneTitle,
} from "@/components/detail-pane";
import { EmptyState } from "@/components/empty-state";
import { ExpandableClamp } from "@/components/expandable-clamp";
import {
  ListPane,
  ListPaneActions,
  ListPaneHeader,
  ListPaneScroll,
  ListPaneSearch,
  ListPaneTitle,
  ListPaneTitleRow,
} from "@/components/list-pane";
import { UnderlineTab, UnderlineTabs } from "@/components/underline-tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import {
  ensureConnectionAlive,
  isConnectionLostError,
  reconnectConnection,
} from "@/lib/connection-health";
import { formatWhen } from "@/lib/format";
import {
  isQueryCancelled,
  runCancellableQuery,
} from "@/lib/run-query";
import { switchActiveConnection } from "@/lib/session";
import { api, isDesktopRequiredError, onEvent } from "@/lib/tauri";
import type { HistoryEntry, HistoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

type KindFilter = "all" | HistoryKind;
type StatusFilter = "all" | "ok" | "error";

function KindIcon({ kind }: { kind: HistoryKind }) {
  if (kind === "agent") {
    return <Bot className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Database className="size-3.5 shrink-0 text-muted-foreground" />;
}

function statusTone(status: string): "ok" | "error" | "other" {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success") return "ok";
  if (s === "error" || s === "failed") return "error";
  return "other";
}

function entryMetaLine(e: HistoryEntry): string {
  const parts: string[] = [formatWhen(e.createdAt)];
  if (e.connName) parts.push(e.connName);
  if (e.meta?.totalRows != null) {
    parts.push(`${e.meta.totalRows.toLocaleString()} rows`);
  }
  if (e.meta?.durationMs != null) {
    parts.push(`${e.meta.durationMs}ms`);
  }
  return parts.join(" · ");
}

/** Query / agent history — list+detail over on-disk history.json. */
export function HistoryPanel({
  onOpenWorkspace,
}: {
  onOpenWorkspace?: () => void;
} = {}) {
  const {
    setStatus,
    setSql,
    setResult,
    setSchemas,
    setComposerDraft,
    activeConnId,
    connections,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [connFilter, setConnFilter] = useState<string>("all");
  const [rerunningId, setRerunningId] = useState<string | null>(null);

  const connOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.connId) map.set(e.connId, e.connName ?? e.connId.slice(0, 8));
    }
    for (const c of connections) {
      map.set(c.id, c.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries, connections]);

  const filterCount =
    (statusFilter !== "all" ? 1 : 0) + (connFilter !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (statusFilter !== "all") {
        const tone = statusTone(e.status);
        if (statusFilter === "ok" && tone !== "ok") return false;
        if (statusFilter === "error" && tone !== "error") return false;
      }
      if (connFilter !== "all" && e.connId !== connFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        e.status.toLowerCase().includes(q) ||
        (e.connName?.toLowerCase().includes(q) ?? false) ||
        e.body.toLowerCase().includes(q) ||
        (e.detail?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, query, kindFilter, statusFilter, connFilter]);

  const selected =
    filtered.find((e) => e.id === selectedId) ??
    entries.find((e) => e.id === selectedId) ??
    null;

  const refresh = useCallback(async () => {
    try {
      const list = await api.listHistory({ limit: 200 });
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
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const u = await onEvent("history:updated", () => {
        void refresh();
      });
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    if (selectedId && !filtered.some((e) => e.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

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

  async function loadSql(entry: HistoryEntry) {
    setSql(entry.body);
    openArtifact("sql");
    onOpenWorkspace?.();
    setStatus("SQL loaded from history");
    toast({ title: "SQL loaded", tone: "success" });
  }

  function useInAssistant(entry: HistoryEntry) {
    const draft = entry.body.trim();
    if (!draft) {
      toast({ title: "Nothing to send", description: "Empty transcript." });
      return;
    }
    setComposerDraft(draft);
    onOpenWorkspace?.();
    setStatus("Loaded into assistant");
    toast({
      title: "Loaded into assistant",
      description: entry.title,
      tone: "success",
    });
  }

  async function ensureTargetConnection(connId: string): Promise<boolean> {
    if (activeConnId !== connId) {
      await switchActiveConnection(connId);
    }
    const conn = useWorkspace
      .getState()
      .connections.find((c) => c.id === connId);
    if (!conn) {
      toast({
        title: "Connection missing",
        description: "That connection is no longer saved.",
        tone: "error",
      });
      return false;
    }
    if (!conn.connected) {
      try {
        await reconnectConnection(connId);
      } catch (e) {
        toast({
          title: "Reconnect failed",
          description: String(e),
          tone: "error",
        });
        return false;
      }
    } else {
      const alive = await ensureConnectionAlive(connId);
      if (!alive) return false;
    }
    try {
      setSchemas(await api.listSchemas(connId));
    } catch {
      /* schema optional for re-run */
    }
    return true;
  }

  async function rerun(entry: HistoryEntry) {
    if (entry.kind !== "query") return;
    const connId = entry.connId ?? activeConnId;
    if (!connId) {
      toast({
        title: "No connection",
        description: "Select a connection, or load SQL manually.",
        tone: "error",
      });
      return;
    }
    setRerunningId(entry.id);
    try {
      const ok = await ensureTargetConnection(connId);
      if (!ok) return;
      setSql(entry.body);
      onOpenWorkspace?.();
      const page = await runCancellableQuery({
        connId,
        sql: entry.body,
        pageSize: 500,
      });
      setResult(page);
      openArtifact("results");
      const msg = `Re-ran · ${page.totalRows} rows · ${page.durationMs}ms`;
      setStatus(msg);
      toast({ title: "Re-ran query", description: msg, tone: "success" });
    } catch (e) {
      if (isQueryCancelled(e) || isConnectionLostError(e)) return;
      setStatus(String(e));
      toast({
        title: "Re-run failed",
        description: String(e),
        tone: "error",
      });
    } finally {
      setRerunningId(null);
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
                    size="xs"
                    variant="ghost"
                    onClick={() => void clearAll()}
                  >
                    Clear
                  </Button>
                </ListPaneActions>
              )}
            </ListPaneTitleRow>
            <UnderlineTabs className="mb-1.5 border-b border-border/50">
              {(
                [
                  ["all", "All"],
                  ["query", "SQL"],
                  ["agent", "Agent"],
                ] as const
              ).map(([id, label]) => (
                <UnderlineTab
                  key={id}
                  active={kindFilter === id}
                  onClick={() => setKindFilter(id)}
                >
                  {label}
                </UnderlineTab>
              ))}
            </UnderlineTabs>
            <div className="mb-1 flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant={filterCount > 0 ? "secondary" : "ghost"}
                    className="shrink-0"
                  >
                    <ListFilter className="size-3.5" />
                    Filters
                    {filterCount > 0 && (
                      <span className="tabular-nums text-muted-foreground">
                        {filterCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                    Status
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                  >
                    <DropdownMenuRadioItem value="all">
                      All statuses
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="ok">Ok</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="error">
                      Error
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                    Connection
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={connFilter}
                    onValueChange={setConnFilter}
                  >
                    <DropdownMenuRadioItem value="all">
                      All connections
                    </DropdownMenuRadioItem>
                    {connOptions.map(([id, name]) => (
                      <DropdownMenuRadioItem key={id} value={id}>
                        {name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {filterCount > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setStatusFilter("all");
                          setConnFilter("all");
                        }}
                      >
                        Clear filters
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <ListPaneSearch
                value={query}
                onChange={setQuery}
                placeholder="Search history…"
                className="mb-0 min-w-0 flex-1"
              />
            </div>
          </ListPaneHeader>
          <ListPaneScroll className="pt-28">
            <div className="space-y-0.5 px-1">
              {entries.length === 0 ? (
                <EmptyState
                  dashed
                  className="min-h-40 p-4"
                  icon={<History className="size-8" />}
                  title="No history yet"
                  description="Runs from the Assistant and SQL editor will show up here."
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  className="min-h-40 p-4"
                  title="No matches"
                  description="Try a different filter or search."
                />
              ) : (
                filtered.map((e) => {
                  const active = selectedId === e.id;
                  const tone = statusTone(e.status);
                  const busy = rerunningId === e.id;
                  return (
                    <div key={e.id} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 pr-16 text-left transition-colors",
                          active
                            ? "border-border bg-muted/70"
                            : "border-transparent hover:bg-muted/30",
                        )}
                        onClick={() => setSelectedId(e.id)}
                      >
                        <KindIcon kind={e.kind} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[13px] font-medium leading-snug",
                              tone === "error" && "text-destructive",
                            )}
                          >
                            {e.title}
                          </span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                            {tone === "error" && (
                              <>
                                <span className="text-destructive">error</span>
                                <span aria-hidden>·</span>
                              </>
                            )}
                            {kindFilter === "all" && (
                              <>
                                <span className="capitalize">{e.kind}</span>
                                <span aria-hidden>·</span>
                              </>
                            )}
                            <span className="truncate tabular-nums">
                              {entryMetaLine(e)}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {e.kind === "query" ? (
                          <>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Re-run"
                              aria-label={`Re-run ${e.title}`}
                              disabled={busy || !!rerunningId}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                void rerun(e);
                              }}
                            >
                              <Play className="size-3" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Load SQL"
                              aria-label={`Load SQL for ${e.title}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                void loadSql(e);
                              }}
                            >
                              <FileCode2 className="size-3" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Use in assistant"
                            aria-label={`Use ${e.title} in assistant`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              useInAssistant(e);
                            }}
                          >
                            <MessageSquarePlus className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ListPaneScroll>
        </ListPane>
      </div>

      <DetailPane>
        {selected ? (
          <>
            <DetailPaneHeader>
              <div className="min-w-0">
                <DetailPaneMeta>
                  <span className="capitalize">{selected.kind}</span>
                  {statusTone(selected.status) === "error" ? (
                    <span className="text-destructive"> · error</span>
                  ) : (
                    <span> · {selected.status}</span>
                  )}
                  {selected.connName ? ` · ${selected.connName}` : ""}
                  {" · "}
                  {formatWhen(selected.createdAt)}
                  {selected.meta?.durationMs != null && (
                    <> · {String(selected.meta.durationMs)}ms</>
                  )}
                  {selected.meta?.totalRows != null && (
                    <> · {String(selected.meta.totalRows)} rows</>
                  )}
                </DetailPaneMeta>
                <DetailPaneTitle>{selected.title}</DetailPaneTitle>
              </div>
              <DetailPaneActions>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(selected.body).then(
                      () => toast({ title: "Copied", tone: "success" }),
                      () =>
                        toast({ title: "Couldn’t copy", tone: "error" }),
                    );
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
                {selected.kind === "query" ? (
                  <>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void loadSql(selected)}
                    >
                      Load SQL
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={!!rerunningId}
                      onClick={() => void rerun(selected)}
                    >
                      <Play className="size-3.5" />
                      {rerunningId === selected.id ? "Running…" : "Re-run"}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => useInAssistant(selected)}
                  >
                    <MessageSquarePlus className="size-3.5" />
                    Use in assistant
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => void remove(selected.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </DetailPaneActions>
            </DetailPaneHeader>
            <DetailPaneScroll className="space-y-4">
              <ExpandableClamp maxHeight={240}>
                <pre className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/25 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  {selected.body}
                </pre>
              </ExpandableClamp>
              {selected.detail && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {statusTone(selected.status) === "error"
                      ? "Error"
                      : "Response"}
                  </h3>
                  <ExpandableClamp maxHeight={280}>
                    <pre
                      className={cn(
                        "whitespace-pre-wrap rounded-md border border-border/50 bg-muted/15 p-4 text-xs leading-relaxed",
                        statusTone(selected.status) === "error" &&
                          "text-destructive",
                      )}
                    >
                      {selected.detail}
                    </pre>
                  </ExpandableClamp>
                </div>
              )}
            </DetailPaneScroll>
          </>
        ) : (
          <>
            <DetailPaneHeader>
              <DetailPaneTitle className="mt-0">Run detail</DetailPaneTitle>
            </DetailPaneHeader>
            <DetailPaneScroll>
              <EmptyState
                title="Select a run"
                description="Pick a query or agent transcript from the list."
              />
            </DetailPaneScroll>
          </>
        )}
      </DetailPane>
    </div>
  );
}
