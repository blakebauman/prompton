import { useEffect, useState } from "react";
import { AppWindow, Plug } from "lucide-react";

import {
  ActivityRail,
  type ActivityId,
} from "@/components/activity-rail";
import {
  ArtifactProvider,
  useArtifact,
} from "@/components/artifact/artifact-context";
import { ArtifactPane } from "@/components/artifact/artifact-pane";
import { ConnectionStatus } from "@/components/connection-status";
import { ProdBadge } from "@/components/prod-badge";
import { StatusPill, statusTone } from "@/components/status-pill";
import { PRODUCT_TAGLINE } from "@/components/brand-mark";
import {
  DragRegion,
  TitleBarDragRegion,
} from "@/components/titlebar-drag-region";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AssistantPanel } from "@/features/chat/ChatPanel";
import { ConnectionsPanel } from "@/features/connections/ConnectionsPanel";
import { HistoryPanel } from "@/features/history/HistoryPanel";
import { LibraryPanel } from "@/features/library/LibraryPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { useActivityLogBridge } from "@/hooks/use-activity-log-bridge";
import {
  requestCancelQuery,
  requestFormatSql,
  requestRunSql,
  useAppShortcuts,
} from "@/hooks/use-app-shortcuts";
import { useWorkspacePersist } from "@/hooks/use-workspace-persist";
import { toast } from "@/hooks/use-toast";
import {
  reconnectConnection,
  refreshConnections,
} from "@/lib/connection-health";
import { api, isDesktopRequiredError } from "@/lib/tauri";
import { TOP_SAFE_AREA_PADDING } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

export default function App() {
  return (
    <TooltipProvider>
      <ArtifactProvider defaultOpen>
        <AppShell />
        <Toaster />
      </ArtifactProvider>
    </TooltipProvider>
  );
}

function AppShell() {
  const {
    status,
    setStatus,
    setSchemas,
    connections,
    activeConnId,
    agentBusy,
    running,
  } = useWorkspace();
  const { state: artifact, toggle, open: openArtifact } = useArtifact();
  const active = connections.find((c) => c.id === activeConnId);
  const [activity, setActivity] = useState<ActivityId>("workspace");
  const [reconnecting, setReconnecting] = useState(false);
  const busy = agentBusy || running;

  async function onReconnectActive() {
    if (!activeConnId || !active) return;
    setReconnecting(true);
    try {
      await reconnectConnection(activeConnId);
      try {
        setSchemas(await api.listSchemas(activeConnId));
      } catch {
        /* schemas optional after reconnect */
      }
      setStatus(`Active: ${active.name}`);
      toast({
        title: "Reconnected",
        description: active.name,
        tone: "success",
      });
    } catch (e) {
      await refreshConnections().catch(() => undefined);
      setStatus(String(e));
      toast({
        title: "Reconnect failed",
        description: String(e),
        tone: "error",
      });
    } finally {
      setReconnecting(false);
    }
  }
  const tone = statusTone(status, busy);
  const showStatus =
    !!status &&
    status !== "Ready" &&
    !isDesktopRequiredError(status) &&
    !/Cannot read properties of undefined \(reading ['"]invoke['"]\)/i.test(
      status,
    );

  useEffect(() => {
    if (!showStatus || busy || tone === "error") return;
    const ms = tone === "success" ? 3200 : 4200;
    const t = window.setTimeout(() => setStatus("Ready"), ms);
    return () => window.clearTimeout(t);
  }, [showStatus, busy, tone, status, setStatus]);

  useActivityLogBridge();
  useWorkspacePersist();

  useAppShortcuts({
    toggleArtifact: () => toggle(),
    openSettings: () => setActivity("settings"),
    focusChat: () => {
      setActivity("workspace");
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLTextAreaElement>("[data-assistant-composer]")
          ?.focus();
      });
    },
    runSql: () => {
      setActivity("workspace");
      openArtifact("sql");
      window.setTimeout(() => requestRunSql(), 50);
    },
    formatSql: () => {
      setActivity("workspace");
      openArtifact("sql");
      window.setTimeout(() => requestFormatSql(), 50);
    },
    cancelQuery: () => {
      const s = useWorkspace.getState();
      if (!(s.running && s.activeQueryId)) return false;
      requestCancelQuery();
    },
  });

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden bg-background",
        TOP_SAFE_AREA_PADDING,
      )}
    >
      <TitleBarDragRegion />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityRail active={activity} onSelect={setActivity} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DragRegion
            as="header"
            className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3 select-none"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="truncate text-[12px] tracking-tight text-muted-foreground">
                {PRODUCT_TAGLINE}
              </span>
              {activity === "workspace" && active && (
                <>
                  <span className="text-muted-foreground/40" aria-hidden>
                    /
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <ConnectionStatus connected={!!active.connected} />
                    <span className="truncate font-medium text-foreground">
                      {active.name}
                    </span>
                    {active.isProduction && (
                      <span className="tauri-no-drag">
                        <ProdBadge unlocked={!!active.adminWritesUnlocked} />
                      </span>
                    )}
                    {!active.connected && (
                      <Button
                        size="xs"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={reconnecting}
                        onClick={() => void onReconnectActive()}
                      >
                        <Plug className="size-3" />
                        {reconnecting ? "Connecting…" : "Reconnect"}
                      </Button>
                    )}
                  </span>
                </>
              )}
              {activity !== "workspace" && (
                <>
                  <span className="text-muted-foreground/40" aria-hidden>
                    /
                  </span>
                  <span className="truncate text-xs font-medium text-foreground capitalize">
                    {activity}
                  </span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {showStatus && (
                <StatusPill
                  label={status}
                  tone={tone}
                  onDismiss={() => setStatus("Ready")}
                  className="tauri-no-drag mr-0.5"
                />
              )}
              {activity === "workspace" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant={artifact.open ? "secondary" : "ghost"}
                      className="rounded-md"
                      onClick={() => toggle()}
                      aria-label={
                        artifact.open ? "Hide viewer" : "Show viewer"
                      }
                      aria-pressed={artifact.open}
                    >
                      <AppWindow className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {artifact.open
                      ? "Hide viewer (Results, SQL, Schema)"
                      : "Show viewer (Results, SQL, Schema)"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </DragRegion>

          <div className="min-h-0 flex-1 overflow-hidden">
            {activity === "workspace" && (
              <ResizablePanelGroup
                orientation="horizontal"
                className="h-full min-h-0"
              >
                <ResizablePanel defaultSize="18" minSize="14" maxSize="28">
                  <ConnectionsPanel />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel
                  defaultSize={artifact.open ? "38" : "82"}
                  minSize="28"
                >
                  <AssistantPanel
                    onOpenSettings={() => setActivity("settings")}
                  />
                </ResizablePanel>
                {artifact.open && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize="44" minSize="28">
                      <ArtifactPane />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            )}

            {activity === "history" && (
              <HistoryPanel onOpenWorkspace={() => setActivity("workspace")} />
            )}

            {activity === "library" && (
              <LibraryPanel
                onOpenSettings={() => setActivity("settings")}
                onOpenWorkspace={() => {
                  setActivity("workspace");
                  window.requestAnimationFrame(() => {
                    document
                      .querySelector<HTMLTextAreaElement>(
                        "[data-assistant-composer]",
                      )
                      ?.focus();
                  });
                }}
              />
            )}

            {activity === "settings" && (
              <div className="relative h-full overflow-hidden">
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background to-transparent" />
                <div className="absolute inset-x-0 top-0 z-20 px-6 pt-5">
                  <div className="mx-auto max-w-4xl">
                    <h1 className="text-2xl font-bold tracking-tight">
                      Settings
                    </h1>
                  </div>
                </div>
                <div className="h-full overflow-y-auto">
                  <div className="mx-auto max-w-4xl px-6 pt-16 pb-10">
                    <SettingsPanel />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
