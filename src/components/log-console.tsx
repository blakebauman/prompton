import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  useActivityLog,
  type LogEntry,
  type LogStream,
} from "@/stores/activity-log";
import { cn } from "@/lib/utils";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function streamClass(stream: LogStream): string {
  if (stream === "stderr") return "text-destructive/90";
  if (stream === "success") return "text-success";
  return "text-muted-foreground";
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex gap-3 font-mono text-[11px] leading-5 hover:bg-muted/30">
      <span className="shrink-0 select-none text-muted-foreground/45">
        {formatTime(entry.timestamp)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 break-all whitespace-pre-wrap",
          streamClass(entry.stream),
        )}
      >
        {entry.line}
      </span>
    </div>
  );
}

/** Auto-scrolling mono log console with stick-to-bottom. */
export function LogConsole({
  className,
  emptyHint = "Activity will show up here as you connect, query, and chat.",
}: {
  className?: string;
  emptyHint?: string;
}) {
  const entries = useActivityLog((s) => s.entries);
  const clear = useActivityLog((s) => s.clear);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [entries.length, autoScroll]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium tracking-tight">Activity log</h3>
          <p className="text-xs text-muted-foreground">
            {entries.length === 0
              ? "No lines yet"
              : `${entries.length} line${entries.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setAutoScroll(true);
                containerRef.current?.scrollTo({
                  top: containerRef.current.scrollHeight,
                });
              }}
            >
              Scroll to bottom
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={entries.length === 0}
            onClick={() => {
              clear();
              toast({ title: "Activity log cleared" });
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-h-[280px] flex-1 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3"
      >
        {entries.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground/60">
            {emptyHint}
          </p>
        ) : (
          entries.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
