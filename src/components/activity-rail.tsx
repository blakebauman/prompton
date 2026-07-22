import {
  BookMarked,
  Database,
  History,
  type LucideIcon,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type ActivityId = "workspace" | "history" | "library" | "settings";

const TABS: Array<{
  id: ActivityId;
  icon: LucideIcon;
  label: string;
}> = [
  { id: "workspace", icon: Database, label: "Workspace" },
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
 * Monochrome only — active = muted surface, not colored accent.
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
      <div
        className="mb-4 flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-xs font-bold tracking-tight text-foreground"
        aria-hidden
      >
        P
      </div>

      <div className="flex flex-col gap-2">
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
                "relative flex size-11 items-center justify-center rounded-full transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive
                  ? "bg-muted text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
            </button>
          );
        })}
      </div>

      <span className="mt-auto pb-2 text-[10px] text-muted-foreground/50">
        v0.1
      </span>
    </nav>
  );
}
