import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared empty / coming-soon panel. */
export function EmptyState({
  title,
  description,
  icon,
  actions,
  dashed = false,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  dashed?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      {icon && (
        <div className="mb-2.5 text-muted-foreground/55">{icon}</div>
      )}
      <h3 className="text-sm font-medium tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      {actions && (
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-[200px] flex-col items-center justify-center p-6 text-center",
        className,
      )}
    >
      {dashed ? (
        <div className="mx-auto w-full max-w-sm rounded-lg border border-dashed border-border/70 bg-muted/10 px-5 py-8">
          {inner}
        </div>
      ) : (
        <div className="mx-auto max-w-sm">{inner}</div>
      )}
    </div>
  );
}
