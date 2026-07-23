import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type HelpTip = {
  title: string;
  body: string;
  icon?: ReactNode;
};

/** Sticky tip column for settings tabs (hidden below lg). */
export function SettingsHelpAside({
  title,
  body,
  tips,
  footer,
  className,
}: {
  title: string;
  body?: string;
  tips?: HelpTip[];
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden w-[220px] shrink-0 space-y-4 lg:block",
        className,
      )}
    >
      <div className="space-y-1.5">
        <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
        {body && (
          <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
            {body}
          </p>
        )}
      </div>
      {tips && tips.length > 0 && (
        <ul className="space-y-2.5">
          {tips.map((tip) => (
            <li key={tip.title} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                {tip.icon && (
                  <span className="text-muted-foreground" aria-hidden>
                    {tip.icon}
                  </span>
                )}
                <p className="text-[11px] font-medium text-foreground">
                  {tip.title}
                </p>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
                {tip.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </aside>
  );
}
