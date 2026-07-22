import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** List column: edge hairline, top fade, overlay header. */
export function ListPane({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden bg-muted/20",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 bottom-0 z-30 w-px bg-border"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0, black 48px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, black 48px)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background to-transparent" />
      {children}
    </div>
  );
}

export function ListPaneHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative z-20 shrink-0 px-3 pt-3 pb-2", className)}>
      {children}
    </div>
  );
}

export function ListPaneTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2 className={cn("truncate text-lg font-bold tracking-tight", className)}>
      {children}
    </h2>
  );
}

export function ListPaneScroll({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
