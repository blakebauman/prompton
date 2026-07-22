import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";

import { cn } from "@/lib/utils";

/** Right-hand detail column for list+detail layouts. */
export function DetailPane({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 overflow-hidden border-l border-border/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DetailPaneHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-6 pt-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DetailPaneTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "mt-1 truncate text-xl font-bold tracking-tight",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function DetailPaneMeta({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("text-[11px] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function DetailPaneActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {children}
    </div>
  );
}

/** Scroll body with scroll-gated top edge fade. */
export function DetailPaneScroll({
  className,
  padTop = true,
  children,
}: {
  className?: string;
  padTop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setScrolled(el.scrollTop > 0);
  }, [children]);

  function onScroll(e: UIEvent<HTMLDivElement>) {
    setScrolled(e.currentTarget.scrollTop > 0);
  }

  return (
    <>
      <div
        className={cn(
          "edge-fade-top pointer-events-none absolute inset-x-0 top-0 z-10 h-16 transition-opacity duration-200",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={ref}
        className={cn(
          "h-full overflow-y-auto overflow-x-hidden px-6 pb-8",
          padTop && "pt-20",
          className,
        )}
        onScroll={onScroll}
      >
        {children}
      </div>
    </>
  );
}
