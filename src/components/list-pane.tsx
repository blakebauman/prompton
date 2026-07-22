import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
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
    <div
      className={cn("absolute inset-x-0 top-0 z-20 px-3 pt-3", className)}
    >
      {children}
    </div>
  );
}

export function ListPaneTitleRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mb-2 flex items-center gap-2", className)}>
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
    <h2
      className={cn(
        "min-w-0 truncate text-base font-bold tracking-tight",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function ListPaneActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("ml-auto flex shrink-0 items-center gap-0.5", className)}>
      {children}
    </div>
  );
}

/** Compact search field for overlay list headers. */
export function ListPaneSearch({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-background/50 pr-2.5 pl-8 text-xs shadow-none"
      />
    </div>
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
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-background to-transparent transition-opacity duration-200",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={ref}
        className={cn(
          "relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pt-20 pb-3",
          className,
        )}
        style={style}
        onScroll={onScroll}
      >
        {children}
      </div>
    </>
  );
}
