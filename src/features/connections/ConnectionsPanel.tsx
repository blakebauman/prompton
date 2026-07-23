import { useEffect, useMemo, useState } from "react";
import {
  MoreHorizontal,
  Network,
  Plus,
  Plug,
  PlugZap,
  Trash2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
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
import type { ConnectRequest, ConnectionInfo, Dialect } from "@/lib/types";
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
    setIsProduction(dialect === "postgres");
    setForm((f) => ({
      ...f,
      name: dialect === "sqlite" ? "Local SQLite" : "PostgreSQL",
    }));
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
      <ListPaneHeader>
        <ListPaneTitleRow>
          <ListPaneTitle>Connections</ListPaneTitle>
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
              aria-label="Add connection"
              onClick={() => setOpen(true)}
            >
              <Plus className="size-3.5" />
            </Button>
          </ListPaneActions>
        </ListPaneTitleRow>
        {connections.length > 0 && (
          <ListPaneSearch
            value={query}
            onChange={setQuery}
            placeholder="Search connections…"
          />
        )}
      </ListPaneHeader>

      <ListPaneScroll>
        <div className="space-y-0.5 px-1">
          {connections.length === 0 && (
            <EmptyState
              dashed
              className="min-h-36 p-3"
              title="No connections"
              description="Add Postgres or SQLite, or open a seeded demo to explore."
              actions={
                <>
                  <Button size="xs" onClick={() => setOpen(true)}>
                    <Plus className="size-3.5" />
                    Add connection
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
            return (
              <div key={c.id} className="group relative">
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md border px-2 py-2 text-left transition-colors",
                    active
                      ? "border-border bg-muted/70"
                      : "border-transparent hover:bg-muted/30",
                  )}
                  onClick={() => void selectConnection(c.id)}
                >
                  <div className="flex items-center gap-2 pr-7">
                    <ConnectionStatus connected={c.connected} />
                    <span className="truncate text-[13px] font-medium leading-snug">
                      {c.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        c.connected ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {c.connected ? "Connected" : "Offline"}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{c.dialect}</span>
                    {c.isProduction && (
                      <ProdBadge compact unlocked={!!c.adminWritesUnlocked} />
                    )}
                    <span aria-hidden>·</span>
                    <span className="truncate">{c.summary}</span>
                  </div>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="absolute top-1.5 right-1.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Actions for ${c.name}`}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={() =>
                        void (async () => {
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
                              title: c.connected
                                ? "Disconnect failed"
                                : "Connect failed",
                              description: String(e),
                              tone: "error",
                            });
                          }
                        })()
                      }
                    >
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
                  <SelectItem value="sqlite">SQLite</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
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
                  {dialect === "postgres"
                    ? "Postgres defaults to production: read-only until HITL or admin unlock."
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
