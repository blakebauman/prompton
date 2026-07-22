import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Clamped content with bottom fade and Show more / Show less. */
export function ExpandableClamp({
  children,
  maxHeight = 220,
  className,
}: {
  children: ReactNode;
  maxHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > maxHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, maxHeight]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        className="overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: expanded ? undefined : maxHeight }}
      >
        {children}
      </div>
      {overflows && !expanded && (
        <div className="edge-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 h-14" />
      )}
      {overflows && (
        <div className="mt-2 flex justify-center">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}
