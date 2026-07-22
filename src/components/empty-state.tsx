import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared empty / coming-soon panel (Voicebox dashed empty, monochrome). */
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
        <div className="mb-2 text-muted-foreground opacity-50">{icon}</div>
      )}
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      {actions && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-[220px] flex-col items-center justify-center p-8 text-center",
        className,
      )}
    >
      {dashed ? (
        <div className="mx-auto w-full max-w-sm rounded-2xl border-2 border-dashed border-muted px-6 py-10">
          {inner}
        </div>
      ) : (
        <div className="mx-auto max-w-sm">{inner}</div>
      )}
    </div>
  );
}
