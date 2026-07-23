import {
  BookMarked,
  Columns2,
  History,
  type LucideIcon,
  Settings,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { DragRegion } from "@/components/titlebar-drag-region";
import { APP_VERSION } from "@/lib/app-version";
import { cn } from "@/lib/utils";

export type ActivityId = "workspace" | "history" | "library" | "settings";

const TABS: Array<{
  id: ActivityId;
  icon: LucideIcon;
  label: string;
}> = [
  // Columns2 = three-pane workspace; Database is reserved for the brand mark.
  { id: "workspace", icon: Columns2, label: "Workspace" },
  { id: "history", icon: History, label: "History" },
  { id: "library", icon: BookMarked, label: "Library" },
  { id: "settings", icon: Settings, label: "Settings" },
];

type ActivityRailProps = {
  active: ActivityId;
  onSelect: (id: ActivityId) => void;
  className?: string;
};

/**
 * Narrow activity rail for primary app areas.
 * Monochrome only — active uses a frosted circular control.
 */
export function ActivityRail({
  active,
  onSelect,
  className,
}: ActivityRailProps) {
  return (
    <nav
      className={cn(
        "flex h-full w-16 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3",
        className,
      )}
      aria-label="Primary"
    >
      <DragRegion
        className="mb-4 flex select-none items-center justify-center"
        aria-hidden
      >
        <BrandMark wordmark={false} size="sm" />
      </DragRegion>

      <div className="flex flex-col gap-2.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.label}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "relative flex size-11 items-center justify-center overflow-hidden rounded-full transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive
                  ? "border border-white/[0.08] bg-white/[0.06] text-foreground shadow-lg backdrop-blur-sm dark:bg-white/[0.07]"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {isActive && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-full border border-foreground/15"
                  style={{
                    maskImage:
                      "linear-gradient(to bottom, black, transparent 60%)",
                    WebkitMaskImage:
                      "linear-gradient(to bottom, black, transparent 60%)",
                  }}
                  aria-hidden
                />
              )}
              <Icon className="relative z-10 size-5" />
            </button>
          );
        })}
      </div>

      <span
        className="mt-auto w-full pb-3 text-center text-[10px] tabular-nums text-muted-foreground/60"
        title={`Prompton v${APP_VERSION}`}
      >
        v{APP_VERSION}
      </span>
    </nav>
  );
}
