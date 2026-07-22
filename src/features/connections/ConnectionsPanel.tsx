import { useEffect, useState } from "react";
import {
  MoreHorizontal,
  Network,
  Plus,
  Plug,
  PlugZap,
  Trash2,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { EmptyState } from "@/components/empty-state";
import {
  ListPane,
  ListPaneActions,
  ListPaneHeader,
  ListPaneScroll,
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
import { connectionMarkColor } from "@/lib/connection-mark";
import { abandonConnectionWork } from "@/lib/session";
import { api, isDesktopRequiredError } from "@/lib/tauri";
import type { ConnectRequest, ConnectionInfo, Dialect } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

/** Stored on new connections; UI prefers `connectionMarkColor`. */
const COLOR = {
  sqlite: "oklch(0.55 0 0)",
  postgres: "oklch(0.72 0 0)",
  prod: "var(--prod)",
} as const;

export function ConnectionsPanel() {
  const {
    connections,
    activeConnId,
    setConnections,
    setActiveConnId,
    setSchemas,
    setSql,
    setResult,
    setStatus,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [open, setOpen] = useState(false);
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
    const list = await api.listConnections();
    setConnections(list);
  }

  useEffect(() => {
    void refresh().catch((e) => {
      if (isDesktopRequiredError(e)) return;
      setStatus(String(e));
    });
  }, []);

  async function selectConnection(id: string) {
    if (id !== activeConnId) {
      await abandonConnectionWork();
    }
    setActiveConnId(id);
    const conn = connections.find((c) => c.id === id);
    if (conn && !conn.connected) {
      try {
        await api.reconnectDb(id);
        await refresh();
      } catch (e) {
        setStatus(String(e));
        return;
      }
    }
    try {
      const schemas = await api.listSchemas(id);
      setSchemas(schemas);
      setStatus(`Active: ${conn?.name ?? id}`);
    } catch (e) {
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
            color: isProduction ? COLOR.prod : COLOR.sqlite,
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
            color: isProduction ? COLOR.prod : COLOR.postgres,
            isProduction,
          };

    try {
      const info = await api.connectDb(request);
      await refresh();
      setOpen(false);
      await selectConnection(info.id);
      openArtifact("schema");
    } catch (e) {
      setStatus(String(e));
    }
  }

  async function connectDemo() {
    try {
      setStatus("Seeding demo database…");
      const [info, page] = await api.openDemoSqlite();
      await refresh();
      await abandonConnectionWork();
      setActiveConnId(info.id);
      const schemas = await api.listSchemas(info.id);
      setSchemas(schemas);
      setSql(
        "SELECT id, user_id, status, total_cents, placed_at FROM orders ORDER BY id;",
      );
      setResult(page);
      openArtifact("results");
      setStatus(`Demo ready · ${page.totalRows.toLocaleString()} orders`);
    } catch (e) {
      setStatus(String(e));
    }
  }

  async function updateConn(next: ConnectionInfo) {
    setConnections(connections.map((c) => (c.id === next.id ? next : c)));
  }

  return (
    <ListPane>
      <ListPaneHeader>
        <ListPaneTitleRow>
          <ListPaneTitle>Connections</ListPaneTitle>
          <ListPaneActions>
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0"
              title="Open schema"
              aria-label="Open schema"
              disabled={!activeConnId}
              onClick={() => openArtifact("schema")}
            >
              <Network className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0"
              aria-label="Add connection"
              onClick={() => setOpen(true)}
            >
              <Plus className="size-4" />
            </Button>
          </ListPaneActions>
        </ListPaneTitleRow>
      </ListPaneHeader>

      <ListPaneScroll>
        <div className="space-y-1 px-1">
          {connections.length === 0 && (
            <EmptyState
              dashed
              className="min-h-40 p-4"
              title="No connections"
              description="Add Postgres or SQLite, or open a seeded demo to explore."
              actions={
                <>
                  <Button size="sm" onClick={() => setOpen(true)}>
                    Add connection
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void connectDemo()}
                  >
                    Open demo SQLite
                  </Button>
                </>
              }
            />
          )}

          {connections.map((c) => {
            const active = activeConnId === c.id;
            return (
              <div key={c.id} className="group relative">
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md border p-2.5 text-left transition-colors",
                    active
                      ? "border-border bg-muted/70"
                      : "border-transparent hover:bg-muted/30",
                  )}
                  onClick={() => void selectConnection(c.id)}
                >
                  <div className="flex items-center gap-2 pr-7">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        c.connected
                          ? "ring-2 ring-foreground/25"
                          : "opacity-35",
                      )}
                      style={{ background: connectionMarkColor(c) }}
                      title={c.connected ? "Connected" : "Disconnected"}
                    />
                    <span className="truncate text-[13px] font-medium leading-snug">
                      {c.name}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
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
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 size-7 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
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
                            if (c.connected) await api.disconnectDb(c.id);
                            else await api.reconnectDb(c.id);
                            await refresh();
                          } catch (e) {
                            setStatus(String(e));
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
                          } catch (e) {
                            setStatus(String(e));
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
                              setStatus(
                                next.adminWritesUnlocked
                                  ? `Admin unlocked writes on ${c.name}`
                                  : `Re-locked writes on ${c.name}`,
                              );
                            } catch (e) {
                              setStatus(String(e));
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
                          if (activeConnId === c.id) {
                            await abandonConnectionWork();
                            setActiveConnId(null);
                            setSchemas([]);
                          }
                          await api.removeConnection(c.id);
                          await refresh();
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
            <button
              type="button"
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              onClick={() => void connectDemo()}
            >
              Reseed demo SQLite…
            </button>
          )}
        </div>
      </ListPaneScroll>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New connection</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Dialect</Label>
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
            <div className="grid gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                className="h-8"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            {dialect === "sqlite" ? (
              <div className="grid gap-1.5">
                <Label className="text-xs">File path</Label>
                <Input
                  className="h-8"
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
                  <div className="col-span-2 grid gap-1.5">
                    <Label className="text-xs">Host</Label>
                    <Input
                      className="h-8"
                      value={form.host}
                      onChange={(e) =>
                        setForm({ ...form, host: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Port</Label>
                    <Input
                      className="h-8"
                      value={form.port}
                      onChange={(e) =>
                        setForm({ ...form, port: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Database</Label>
                  <Input
                    className="h-8"
                    value={form.database}
                    onChange={(e) =>
                      setForm({ ...form, database: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">User</Label>
                    <Input
                      className="h-8"
                      value={form.username}
                      onChange={(e) =>
                        setForm({ ...form, username: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Password</Label>
                    <Input
                      className="h-8"
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
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="is-production" className="text-xs">
                  Production database
                </Label>
                <p className="text-xs text-muted-foreground text-pretty">
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onConnect()}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPane>
  );
}
