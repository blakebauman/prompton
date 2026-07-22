import type { ReactNode } from "react";
import { CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  ready: boolean;
  icon?: ReactNode;
  action?: ReactNode;
};

/** Ready / not-ready row with optional inline fix action. */
export function ChecklistRow({
  title,
  description,
  ready,
  icon,
  action,
  className,
}: {
  title: string;
  description: string;
  ready: boolean;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
        ready
          ? "border-success/25 bg-success-muted/40"
          : "border-border/60 bg-muted/20",
        className,
      )}
    >
      <div className="mt-0.5 shrink-0">
        {ready ? (
          <CheckCircle2 className="size-5 text-success" aria-hidden />
        ) : (
          <Circle className="size-5 text-muted-foreground/45" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-muted-foreground" aria-hidden>
              {icon}
            </span>
          )}
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
        {!ready && action ? <div className="pt-1.5">{action}</div> : null}
      </div>
    </div>
  );
}

/** Stacked readiness checklist for empty / first-run surfaces. */
export function SetupChecklist({
  title,
  description,
  items,
  className,
}: {
  title?: string;
  description?: string;
  items: ChecklistItem[];
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-md space-y-3", className)}>
      {(title || description) && (
        <div className="space-y-1 text-center">
          {title && (
            <h3 className="text-sm font-medium tracking-tight">{title}</h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-2 text-left">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            title={item.title}
            description={item.description}
            ready={item.ready}
            icon={item.icon}
            action={item.action}
          />
        ))}
      </div>
    </div>
  );
}
