import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

/** Settings section header + stacked rows. */
export function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground text-pretty">{description}</p>
      )}
      <div className="mt-1 divide-y divide-border/50 rounded-lg border border-border/50 bg-muted/15 px-3">
        {children}
      </div>
    </section>
  );
}

/** Settings row — label left, control right. */
export function SettingRow({
  title,
  description,
  htmlFor,
  action,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Label htmlFor={htmlFor} className="text-sm font-medium leading-none">
            {title}
          </Label>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
