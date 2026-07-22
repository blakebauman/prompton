import { useState } from "react";
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
import { ProdBadge } from "@/components/prod-badge";
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
  const { status, connections, activeConnId } = useWorkspace();
  const { state: artifact, toggle } = useArtifact();
  const active = connections.find((c) => c.id === activeConnId);
  const [activity, setActivity] = useState<ActivityId>("workspace");
  const showStatus =
    !!status &&
    status !== "Ready" &&
    !isDesktopRequiredError(status) &&
    !/Cannot read properties of undefined \(reading ['"]invoke['"]\)/i.test(
      status,
    );

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
              <span className="shrink-0 text-sm font-semibold tracking-tight">
                Prompton
              </span>
              {activity === "workspace" && active && (
                <>
                  <span className="text-muted-foreground/40" aria-hidden>
                    /
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full ring-2 ring-background"
                      style={{ background: active.color }}
                      aria-hidden
                    />
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
            <div className="flex shrink-0 items-center gap-1">
              {showStatus && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="mr-1 max-w-50 truncate text-xs text-muted-foreground">
                      {status}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm">
                    {status}
                  </TooltipContent>
                </Tooltip>
              )}
              {activity === "workspace" && (
                <Button
                  size="sm"
                  variant="ghost"
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
                  <span className="hidden sm:inline">Artifact</span>
                </Button>
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
                  <ChatPanel />
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
              <div className="h-full overflow-y-auto">
                <div className="mx-auto max-w-2xl px-6 py-6">
                  <h1 className="mb-6 text-2xl font-bold tracking-tight">
                    Settings
                  </h1>
                  <SettingsPanel />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
