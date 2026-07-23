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
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-[11px] text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      <div className="mt-1.5 divide-y divide-border/50 rounded-md border border-border/50 bg-muted/15 px-2.5">
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
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label
            htmlFor={htmlFor}
            className="text-[13px] font-medium leading-none"
          >
            {title}
          </Label>
          {description && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
