import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

type NoticeTone = "warning" | "prod" | "neutral";

const TONE: Record<
  NoticeTone,
  { wrap: string; icon: string }
> = {
  warning: {
    wrap: "border-border/70 bg-muted/40",
    icon: "text-muted-foreground",
  },
  prod: {
    wrap: "border-prod/25 bg-prod-muted text-prod",
    icon: "text-prod",
  },
  neutral: {
    wrap: "border-border/60 bg-muted/30",
    icon: "text-muted-foreground",
  },
};

/** Inline notice strip with optional primary/secondary actions. */
export function ActionNotice({
  title,
  description,
  tone = "neutral",
  icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  tone?: NoticeTone;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const styles = TONE[tone];

  return (
    <div
      className={cn(
        "rounded-lg border px-3.5 py-3",
        styles.wrap,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 shrink-0", styles.icon)} aria-hidden>
          {icon ?? <AlertTriangle className="size-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          )}
          {actions && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
