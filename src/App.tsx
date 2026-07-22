import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

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
import { TitleBarDragRegion } from "@/components/titlebar-drag-region";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { ConnectionsPanel } from "@/features/connections/ConnectionsPanel";
import { HistoryPanel } from "@/features/history/HistoryPanel";
import { LibraryPanel } from "@/features/library/LibraryPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { isDesktopRequiredError } from "@/lib/tauri";
import { TOP_SAFE_AREA_PADDING } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

export default function App() {
  return (
    <TooltipProvider>
      <ArtifactProvider defaultOpen>
        <AppShell />
      </ArtifactProvider>
    </TooltipProvider>
  );
}

function AppShell() {
  const {
    status,
    setStatus,
    connections,
    activeConnId,
    agentBusy,
    running,
  } = useWorkspace();
  const { state: artifact, toggle } = useArtifact();
  const active = connections.find((c) => c.id === activeConnId);
  const [activity, setActivity] = useState<ActivityId>("workspace");
  const busy = agentBusy || running;
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
          <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className="flex size-5 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-[10px] font-bold tracking-tight"
                  aria-hidden
                >
                  P
                </span>
                <span className="text-sm font-semibold tracking-tight">
                  Prompton
                </span>
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
                      <ProdBadge unlocked={!!active.adminWritesUnlocked} />
                    )}
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
                  className="mr-0.5"
                />
              )}
              {activity === "workspace" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-md"
                      onClick={() => toggle()}
                      aria-label={
                        artifact.open ? "Hide artifact" : "Show artifact"
                      }
                    >
                      {artifact.open ? (
                        <PanelRightClose className="size-4" />
                      ) : (
                        <PanelRightOpen className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {artifact.open ? "Hide artifact" : "Show artifact"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </header>

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
                  <ChatPanel
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
              <LibraryPanel onOpenSettings={() => setActivity("settings")} />
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
