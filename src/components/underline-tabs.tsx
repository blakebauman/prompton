import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Horizontal underline tab strip — square edges, no scrollbar chrome. */
export function UnderlineTabs({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <nav
      className={cn(
        "scrollbar-none flex min-w-0 flex-1 items-end gap-0 overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      {children}
    </nav>
  );
}

export function UnderlineTab({
  active,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-none border-0 border-b-2 px-2.5 text-xs font-medium transition-colors -mb-px",
        "bg-transparent shadow-none outline-none",
        "focus-visible:bg-muted/40 focus-visible:text-foreground",
        active
          ? "border-b-foreground text-foreground"
          : "border-b-transparent text-muted-foreground hover:border-b-muted-foreground/30 hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
