import { useEffect, useMemo, useState } from "react";
import {
  HardDrive,
  Loader2,
  MoreHorizontal,
  Network,
  Plus,
  Plug,
  PlugZap,
  Trash2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { DialectIcon, dialectLabel } from "@/components/brand-icon";
import { ConnectionStatus } from "@/components/connection-status";
import { EmptyState } from "@/components/empty-state";
import {
  ListPane,
  ListPaneActions,
  ListPaneHeader,
  ListPaneScroll,
  ListPaneSearch,
  ListPaneTitle,
  ListPaneTitleRow,
} from "@/components/list-pane";
import { ProdBadge } from "@/components/prod-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  ensureConnectionAlive,
  handleMaybeLostConnection,
  reconnectConnection,
  refreshConnections,
} from "@/lib/connection-health";
import { connectionIdentityColor } from "@/lib/connection-mark";
import {
  forgetConnectionDraft,
  switchActiveConnection,
} from "@/lib/session";
import { api, isDesktopRequiredError } from "@/lib/tauri";
import { formatFileSize, formatWhen } from "@/lib/format";
import type {
  ConnectRequest,
  ConnectionInfo,
  Dialect,
  DiscoverLocalDatabasesResult,
  LocalDatabaseHit,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadWorkspaceSnapshot } from "@/lib/workspace-persist";
import { useWorkspace } from "@/stores/workspace";

export function ConnectionsPanel() {
  const {
    connections,
    activeConnId,
    setConnections,
    setSchemas,
    setSql,
    setResult,
    setStatus,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [open, setOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverDays, setDiscoverDays] = useState("30");
  const [discoverResult, setDiscoverResult] =
    useState<DiscoverLocalDatabasesResult | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialect, setDialect] = useState<Dialect>("sqlite");
  const [isProduction, setIsProduction] = useState(false);
  const [form, setForm] = useState({
    name: "Local SQLite",
    host: "localhost",
    port: "5432",
    database: "postgres",
    username: "postgres",
    password: "",
    filePath: "",
  });

  useEffect(() => {
    setIsProduction(dialect === "postgres" || dialect === "mysql");
    setForm((f) => {
      if (dialect === "sqlite") {
        return { ...f, name: "Local SQLite" };
      }
      if (dialect === "mysql") {
        return {
          ...f,
          name: "MySQL",
          port: "3306",
          database: "mysql",
          username: "root",
          host: f.host || "127.0.0.1",
        };
      }
      return {
        ...f,
        name: "PostgreSQL",
        port: "5432",
        database: "postgres",
        username: "postgres",
        host: f.host || "127.0.0.1",
      };
    });
  }, [dialect]);

  useEffect(() => {
    if (dialect !== "sqlite" || form.filePath) return;
    void api
      .appDataDir()
      .then((dir) => {
        setForm((f) =>
          f.filePath
            ? f
            : { ...f, filePath: `${dir.replace(/\/$/, "")}/local.db` },
        );
      })
      .catch(() => {
        /* browser preview / no desktop runtime */
      });
  }, [dialect, form.filePath]);

  async function refresh() {
    await refreshConnections();
  }

  useEffect(() => {
    void (async () => {
      try {
        const list = await refreshConnections();
        const snap = loadWorkspaceSnapshot();
        if (snap.activeConnId && list.some((c) => c.id === snap.activeConnId)) {
          // Restore without overwriting saved drafts with the cold default store.
          await switchActiveConnection(snap.activeConnId, {
            persistCurrent: false,
          });
          await selectConnection(snap.activeConnId);
        } else if (!snap.activeConnId && snap.orphanSql) {
          setSql(snap.orphanSql);
        }
      } catch (e) {
        if (isDesktopRequiredError(e)) return;
        setStatus(String(e));
      }
    })();
    // Boot once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectConnection(id: string) {
    const switching = id !== useWorkspace.getState().activeConnId;
    if (switching) {
      await switchActiveConnection(id);
    }
    const conn = useWorkspace
      .getState()
      .connections.find((c) => c.id === id);
    if (conn && !conn.connected) {
      try {
        await reconnectConnection(id);
        toast({
          title: "Reconnected",
          description: conn.name,
          tone: "success",
        });
      } catch (e) {
        setStatus(String(e));
        toast({
          title: "Reconnect failed",
          description: String(e),
          tone: "error",
        });
        return;
      }
    } else if (conn?.connected) {
      const alive = await ensureConnectionAlive(id);
      if (!alive) return;
    }
    try {
      const schemas = await api.listSchemas(id);
      setSchemas(schemas);
      const name =
        useWorkspace.getState().connections.find((c) => c.id === id)?.name ??
        conn?.name ??
        id;
      setStatus(`Active: ${name}`);
    } catch (e) {
      if (await handleMaybeLostConnection(e, id)) return;
      setStatus(String(e));
    }
  }

  async function onConnect() {
    const request: ConnectRequest =
      dialect === "sqlite"
        ? {
            name: form.name || "SQLite",
            dialect: "sqlite",
            filePath: form.filePath,
            color: connectionIdentityColor({
              dialect: "sqlite",
              isProduction,
            }),
            isProduction,
          }
        : dialect === "mysql"
          ? {
              name: form.name || "MySQL",
              dialect: "mysql",
              host: form.host,
              port: Number(form.port) || 3306,
              database: form.database,
              username: form.username,
              password: form.password,
              color: connectionIdentityColor({
                dialect: "mysql",
                isProduction,
              }),
              isProduction,
            }
          : {
              name: form.name || "PostgreSQL",
              dialect: "postgres",
              host: form.host,
              port: Number(form.port) || 5432,
              database: form.database,
              username: form.username,
              password: form.password,
              color: connectionIdentityColor({
                dialect: "postgres",
                isProduction,
              }),
              isProduction,
            };

    try {
      const info = await api.connectDb(request);
      await refresh();
      setOpen(false);
      await selectConnection(info.id);
      openArtifact("schema");
      toast({
        title: "Connected",
        description: info.name,
        tone: "success",
      });
    } catch (e) {
      setStatus(String(e));
      toast({
        title: "Connection failed",
        description: String(e),
        tone: "error",
      });
    }
  }

  async function connectDemo() {
    try {
      setStatus("Seeding demo database…");
      const [info, page] = await api.openDemoSqlite();
      await refresh();
      await switchActiveConnection(info.id);
      const schemas = await api.listSchemas(info.id);
      setSchemas(schemas);
      setSql(
        "SELECT id, user_id, status, total_cents, placed_at FROM orders ORDER BY id;",
      );
      setResult(page);
      openArtifact("results");
      const msg = `Demo ready · ${page.totalRows.toLocaleString()} orders`;
      setStatus(msg);
      toast({ title: "Demo ready", description: msg, tone: "success" });
    } catch (e) {
      setStatus(String(e));
      toast({
        title: "Demo failed",
        description: String(e),
        tone: "error",
      });
    }
  }

  async function runDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const days = Number(discoverDays) || 30;
      const result = await api.discoverLocalDatabases({
        maxAgeDays: days,
        maxResults: 40,
        includeVolumes: true,
      });
      setDiscoverResult(result);
      if (result.hits.length === 0) {
        setStatus("No recent local SQLite databases found");
      } else {
        setStatus(
          `Found ${result.hits.length} local database${result.hits.length === 1 ? "" : "s"}`,
        );
      }
    } catch (e) {
      if (isDesktopRequiredError(e)) {
        setDiscoverError("Desktop app required for disk scan.");
      } else {
        setDiscoverError(String(e));
      }
      setDiscoverResult(null);
    } finally {
      setDiscovering(false);
    }
  }

  function openDiscover() {
    setDiscoverOpen(true);
    setDiscoverError(null);
    if (!discoverResult && !discovering) {
      void runDiscover();
    }
  }

  async function connectDiscovered(hit: LocalDatabaseHit) {
    const existing = connections.find(
      (c) =>
        c.dialect === "sqlite" &&
        (c.summary === hit.path || c.summary.endsWith(hit.path)),
    );
    if (existing) {
      setDiscoverOpen(false);
      await selectConnection(existing.id);
      openArtifact("schema");
      toast({
        title: "Already saved",
        description: existing.name,
      });
      return;
    }
    try {
      const info = await api.connectDb({
        name: hit.name || "SQLite",
        dialect: "sqlite",
        filePath: hit.path,
        color: connectionIdentityColor({
          dialect: "sqlite",
          isProduction: false,
        }),
        isProduction: false,
      });
      await refresh();
      setDiscoverOpen(false);
      await selectConnection(info.id);
      openArtifact("schema");
      toast({
        title: "Connected",
        description: info.name,
        tone: "success",
      });
    } catch (e) {
      setStatus(String(e));
      toast({
        title: "Connection failed",
        description: String(e),
        tone: "error",
      });
    }
  }

  const knownSqlitePaths = useMemo(() => {
    const set = new Set<string>();
    for (const c of connections) {
      if (c.dialect === "sqlite" && c.summary) set.add(c.summary);
    }
    return set;
  }, [connections]);

  async function updateConn(next: ConnectionInfo) {
    setConnections(connections.map((c) => (c.id === next.id ? next : c)));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((c) => {
      const hay = `${c.name} ${c.dialect} ${c.summary}`.toLowerCase();
      return hay.includes(q);
    });
  }, [connections, query]);

  return (
    <ListPane>
      <ListPaneHeader className="px-0 pt-0">
        <ListPaneTitleRow className="mb-0 h-9 border-b border-border/60 px-2">
          <ListPaneTitle className="text-sm font-semibold">
            Connections
          </ListPaneTitle>
          <ListPaneActions>
            <Button
              size="icon-xs"
              variant="ghost"
              title="Open schema"
              aria-label="Open schema"
              disabled={!activeConnId}
              onClick={() => openArtifact("schema")}
            >
              <Network className="size-3.5" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              title="Find recent local databases"
              aria-label="Find recent local databases"
              onClick={() => openDiscover()}
            >
              <HardDrive className="size-3.5" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Add connection"
              onClick={() => setOpen(true)}
            >
              <Plus className="size-3.5" />
            </Button>
          </ListPaneActions>
        </ListPaneTitleRow>
        {connections.length > 0 && (
          <div className="px-2 pt-1.5">
            <ListPaneSearch
              value={query}
              onChange={setQuery}
              placeholder="Search connections…"
            />
          </div>
        )}
      </ListPaneHeader>

      <ListPaneScroll
        className={connections.length > 0 ? "pt-24" : "pt-12"}
      >
        <div className="space-y-0.5 px-1">
          {connections.length === 0 && (
            <EmptyState
              dashed
              className="min-h-36 p-3"
              title="No connections"
              description="Add Postgres, MySQL, or SQLite, scan for recent local SQLite files, or open a seeded demo."
              actions={
                <>
                  <Button size="xs" onClick={() => setOpen(true)}>
                    <Plus className="size-3.5" />
                    Add connection
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => openDiscover()}
                  >
                    <HardDrive className="size-3.5" />
                    Find local DBs
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void connectDemo()}
                  >
                    Open demo SQLite
                  </Button>
                </>
              }
            />
          )}

          {connections.length > 0 && filtered.length === 0 && (
            <EmptyState
              dashed
              className="min-h-28 p-3"
              title="No matches"
              description="Try a different name, dialect, or host."
            />
          )}

          {filtered.map((c) => {
            const active = activeConnId === c.id;
            async function toggleConnected() {
              try {
                if (c.connected) {
                  await api.disconnectDb(c.id);
                  await refresh();
                  toast({
                    title: "Disconnected",
                    description: c.name,
                  });
                } else {
                  await reconnectConnection(c.id);
                  toast({
                    title: "Connected",
                    description: c.name,
                    tone: "success",
                  });
                }
              } catch (e) {
                setStatus(String(e));
                toast({
                  title: c.connected ? "Disconnect failed" : "Connect failed",
                  description: String(e),
                  tone: "error",
                });
              }
            }
            const metaLine = [dialectLabel(c.dialect), c.summary]
              .filter(Boolean)
              .join(" · ");
            return (
              <div key={c.id} className="group relative">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 pr-14 text-left transition-colors",
                    active
                      ? "border-border bg-muted/70"
                      : "border-transparent hover:bg-muted/30",
                  )}
                  onClick={() => void selectConnection(c.id)}
                >
                  <ConnectionStatus connected={c.connected} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium leading-snug">
                        {c.name}
                      </span>
                      {c.isProduction && (
                        <ProdBadge
                          compact
                          unlocked={!!c.adminWritesUnlocked}
                        />
                      )}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <span
                        className={
                          c.connected ? "text-success" : "text-muted-foreground"
                        }
                      >
                        {c.connected ? "Connected" : "Offline"}
                      </span>
                      <span aria-hidden>·</span>
                      <DialectIcon
                        dialect={c.dialect}
                        className="size-3 shrink-0 opacity-80"
                      />
                      <span className="truncate">{metaLine}</span>
                    </span>
                  </span>
                </button>

                <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title={c.connected ? "Disconnect" : "Connect"}
                    aria-label={
                      c.connected
                        ? `Disconnect ${c.name}`
                        : `Connect ${c.name}`
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void toggleConnected();
                    }}
                  >
                    {c.connected ? (
                      <PlugZap className="size-3" />
                    ) : (
                      <Plug className="size-3" />
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="data-[state=open]:opacity-100"
                        aria-label={`Actions for ${c.name}`}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => void toggleConnected()}>
                      {c.connected ? (
                        <PlugZap className="size-3.5" />
                      ) : (
                        <Plug className="size-3.5" />
                      )}
                      {c.connected ? "Disconnect" : "Connect"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void (async () => {
                          try {
                            const next = await api.setConnectionProduction(
                              c.id,
                              !c.isProduction,
                            );
                            await updateConn(next);
                            await refresh();
                            toast({
                              title: next.isProduction
                                ? "Marked production"
                                : "Marked development",
                              description: c.name,
                              tone: "success",
                            });
                          } catch (e) {
                            setStatus(String(e));
                            toast({
                              title: "Couldn’t update connection",
                              description: String(e),
                              tone: "error",
                            });
                          }
                        })()
                      }
                    >
                      {c.isProduction
                        ? "Mark as development"
                        : "Mark as production"}
                    </DropdownMenuItem>
                    {c.isProduction && (
                      <DropdownMenuItem
                        onClick={() =>
                          void (async () => {
                            try {
                              const next = await api.setAdminWritesUnlocked(
                                c.id,
                                !c.adminWritesUnlocked,
                              );
                              await updateConn(next);
                              await refresh();
                              const msg = next.adminWritesUnlocked
                                ? `Admin unlocked writes on ${c.name}`
                                : `Re-locked writes on ${c.name}`;
                              setStatus(msg);
                              toast({
                                title: next.adminWritesUnlocked
                                  ? "Writes unlocked"
                                  : "Writes re-locked",
                                description: c.name,
                                tone: "success",
                              });
                            } catch (e) {
                              setStatus(String(e));
                              toast({
                                title: "Couldn’t update writes",
                                description: String(e),
                                tone: "error",
                              });
                            }
                          })()
                        }
                      >
                        {c.adminWritesUnlocked
                          ? "Re-lock production writes"
                          : "Admin unlock writes"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        void (async () => {
                          if (
                            !window.confirm(
                              `Remove connection “${c.name}”? This does not delete the database file.`,
                            )
                          ) {
                            return;
                          }
                          try {
                            if (activeConnId === c.id) {
                              await switchActiveConnection(null);
                              setSchemas([]);
                            }
                            await api.removeConnection(c.id);
                            forgetConnectionDraft(c.id);
                            await refresh();
                            toast({
                              title: "Connection removed",
                              description: c.name,
                            });
                          } catch (e) {
                            setStatus(String(e));
                            toast({
                              title: "Remove failed",
                              description: String(e),
                              tone: "error",
                            });
                          }
                        })()
                      }
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}

          {connections.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="mt-1.5 w-full justify-start text-muted-foreground"
              onClick={() => void connectDemo()}
            >
              Reseed demo SQLite…
            </Button>
          )}
        </div>
      </ListPaneScroll>

      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="gap-3 p-4 sm:max-w-lg">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-base">
              Recent local databases
            </DialogTitle>
            <p className="text-[12px] leading-snug text-muted-foreground text-pretty">
              Scans your home folders (and mounted volumes) for SQLite files
              with recent activity. Verifies the SQLite header; skips caches and
              package trees.
            </p>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-28 flex-1 gap-1">
              <Label className="text-[11px] text-muted-foreground">
                Active within
              </Label>
              <Select value={discoverDays} onValueChange={setDiscoverDays}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={discovering}
              onClick={() => void runDiscover()}
            >
              {discovering ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <HardDrive className="size-3.5" />
              )}
              {discovering ? "Scanning…" : "Scan again"}
            </Button>
          </div>

          {discoverError && (
            <p className="text-[12px] text-destructive">{discoverError}</p>
          )}

          <div className="max-h-72 overflow-y-auto rounded-md border border-border/60">
            {discovering && !discoverResult ? (
              <div className="flex items-center gap-2 px-3 py-6 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Scanning local disks…
              </div>
            ) : discoverResult && discoverResult.hits.length === 0 ? (
              <EmptyState
                className="min-h-28 border-0 p-3"
                title="No recent SQLite files"
                description="Try a wider time window, or add a path manually."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {(discoverResult?.hits ?? []).map((hit) => {
                  const already = knownSqlitePaths.has(hit.path);
                  return (
                    <li
                      key={hit.path}
                      className="flex items-start gap-2 px-2.5 py-2"
                    >
                      <DialectIcon
                        dialect="sqlite"
                        className="mt-0.5 size-3.5 shrink-0 opacity-80"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium leading-snug">
                          {hit.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {hit.path}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatWhen(hit.activityAt)}
                          <span aria-hidden> · </span>
                          {formatFileSize(hit.sizeBytes)}
                          {already ? (
                            <>
                              <span aria-hidden> · </span>
                              Saved
                            </>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        size="xs"
                        variant={already ? "ghost" : "outline"}
                        className="shrink-0"
                        onClick={() => void connectDiscovered(hit)}
                      >
                        {already ? "Open" : "Connect"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {discoverResult && (
            <p className="text-[11px] text-muted-foreground">
              {discoverResult.visitedFiles.toLocaleString()} files checked in{" "}
              {(discoverResult.durationMs / 1000).toFixed(1)}s
              {discoverResult.truncated ? " · scan capped" : ""}
            </p>
          )}

          <DialogFooter>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setDiscoverOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 p-4 sm:max-w-md">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-base">New connection</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2.5">
            <div className="grid gap-1">
              <Label className="text-[11px] text-muted-foreground">
                Dialect
              </Label>
              <Select
                value={dialect}
                onValueChange={(v) => setDialect(v as Dialect)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqlite">
                    <DialectIcon dialect="sqlite" />
                    SQLite
                  </SelectItem>
                  <SelectItem value="postgres">
                    <DialectIcon dialect="postgres" />
                    PostgreSQL
                  </SelectItem>
                  <SelectItem value="mysql">
                    <DialectIcon dialect="mysql" />
                    MySQL
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[11px] text-muted-foreground">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            {dialect === "sqlite" ? (
              <div className="grid gap-1">
                <Label className="text-[11px] text-muted-foreground">
                  File path
                </Label>
                <Input
                  placeholder="/path/to/database.db"
                  value={form.filePath}
                  onChange={(e) =>
                    setForm({ ...form, filePath: e.target.value })
                  }
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 grid gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Host
                    </Label>
                    <Input
                      value={form.host}
                      onChange={(e) =>
                        setForm({ ...form, host: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Port
                    </Label>
                    <Input
                      value={form.port}
                      onChange={(e) =>
                        setForm({ ...form, port: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Database
                  </Label>
                  <Input
                    value={form.database}
                    onChange={(e) =>
                      setForm({ ...form, database: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                      User
                    </Label>
                    <Input
                      value={form.username}
                      onChange={(e) =>
                        setForm({ ...form, username: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Password
                    </Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                    />
                  </div>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="is-production" className="text-[12px]">
                  Production database
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
                  {dialect === "postgres" || dialect === "mysql"
                    ? "Network databases default to production: read-only until HITL or admin unlock."
                    : "Read-only for the agent until HITL approval or an admin unlocks writes."}
                </p>
              </div>
              <Switch
                id="is-production"
                checked={isProduction}
                onCheckedChange={setIsProduction}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button size="xs" onClick={() => void onConnect()}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPane>
  );
}
