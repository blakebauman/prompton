import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Copy, Database, History, Play, Trash2 } from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    return <Bot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
}

function statusTone(status: string): "ok" | "error" | "other" {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success") return "ok";
  if (s === "error" || s === "failed") return "error";
  return "other";
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
  const [rerunning, setRerunning] = useState(false);

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

  const selected = filtered.find((e) => e.id === selectedId)
    ?? entries.find((e) => e.id === selectedId)
    ?? null;

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

  async function ensureTargetConnection(connId: string): Promise<boolean> {
    if (activeConnId !== connId) {
      await switchActiveConnection(connId);
    }
    const conn = useWorkspace.getState().connections.find((c) => c.id === connId);
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
    setRerunning(true);
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
      setRerunning(false);
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
            <div className="mb-1.5 flex items-center gap-1.5">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger size="sm" className="h-7 flex-1 text-[11px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ok">Ok</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={connFilter}
                onValueChange={setConnFilter}
              >
                <SelectTrigger size="sm" className="h-7 flex-1 text-[11px]">
                  <SelectValue placeholder="Connection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All connections</SelectItem>
                  {connOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ListPaneSearch
              value={query}
              onChange={setQuery}
              placeholder="Search history…"
              className="mb-1"
            />
          </ListPaneHeader>
          <ListPaneScroll className="pt-40">
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
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border p-2.5 text-left transition-colors",
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
                          {tone === "error" && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="text-destructive">error</span>
                            </>
                          )}
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
                {selected.kind === "query" && (
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
                      disabled={rerunning}
                      onClick={() => void rerun(selected)}
                    >
                      <Play className="size-3.5" />
                      {rerunning ? "Running…" : "Re-run"}
                    </Button>
                  </>
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
