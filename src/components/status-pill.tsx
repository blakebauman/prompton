import { X } from "lucide-react";

import { ActivityPulse } from "@/components/activity-pulse";
import { cn } from "@/lib/utils";

export type StatusPillTone = "idle" | "busy" | "error";

/** Compact frosted status chip for the shell header. */
export function StatusPill({
  label,
  tone = "idle",
  onDismiss,
  className,
}: {
  label: string;
  tone?: StatusPillTone;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-8 max-w-64 items-center gap-2 rounded-full px-3",
        "bg-white/80 shadow-sm ring-1 ring-black/5 backdrop-blur-xl",
        "dark:bg-black/55 dark:shadow-none dark:ring-white/10 dark:backdrop-blur-md",
        "transition-opacity duration-300 ease-out",
        tone === "error" && "ring-destructive/30 dark:ring-destructive/40",
        className,
      )}
      role="status"
    >
      {tone === "busy" && <ActivityPulse mode="busy" className="h-3.5" />}
      {tone === "error" && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-destructive"
          aria-hidden
        />
      )}
      <span
        className={cn(
          "min-w-0 truncate text-xs font-medium",
          tone === "error" ? "text-destructive" : "text-foreground/80",
        )}
        title={label}
      >
        {label}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "-mr-1 flex size-5 shrink-0 items-center justify-center rounded-full",
            "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
          aria-label="Dismiss status"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function statusTone(
  status: string,
  busy: boolean,
): StatusPillTone {
  if (busy) return "busy";
  if (/error|failed|rejected|denied|unable|cannot|panic/i.test(status)) {
    return "error";
  }
  return "idle";
}
