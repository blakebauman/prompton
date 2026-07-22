import { Lock, LockOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ProdBadgeProps = {
  unlocked?: boolean;
  className?: string;
  /** Compact mark for dense lists (dot + short label). */
  compact?: boolean;
};

/** Shared production state chip — prefer once in the app header. */
export function ProdBadge({
  unlocked = false,
  className,
  compact = false,
}: ProdBadgeProps) {
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-prod",
          unlocked ? "bg-prod-muted" : "bg-prod-muted/80",
          className,
        )}
        title={
          unlocked
            ? "Production — admin unlocked writes; each mutation still needs HITL approval"
            : "Production — read-only until HITL approval or admin unlock"
        }
      >
        <span
          className="size-1.5 rounded-full bg-prod"
          aria-hidden
        />
        {unlocked ? "Unlocked" : "Prod"}
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 gap-1 border-prod/40 bg-prod-muted px-1.5 text-[10px] font-semibold uppercase tracking-wide text-prod",
        className,
      )}
      title={
        unlocked
          ? "Production — admin unlocked writes; each mutation still needs HITL approval"
          : "Production — read-only until HITL approval or admin unlock"
      }
    >
      {unlocked ? (
        <LockOpen className="size-2.5 shrink-0" aria-hidden />
      ) : (
        <Lock className="size-2.5 shrink-0" aria-hidden />
      )}
      {unlocked ? "Prod · unlocked" : "Prod · read-only"}
    </Badge>
  );
}
