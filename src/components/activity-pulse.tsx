import { cn } from "@/lib/utils";

export type ActivityPulseMode = "idle" | "busy" | "active";

/**
 * Compact 5-bar activity indicator for busy/streaming states.
 * CSS-only motion — monochrome, no external animation library.
 */
export function ActivityPulse({
  mode = "idle",
  className,
  barClassName,
}: {
  mode?: ActivityPulseMode;
  className?: string;
  barClassName?: string;
}) {
  const active = mode !== "idle";
  return (
    <div
      className={cn("flex h-5 items-center gap-[2px]", className)}
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full",
            active ? "bg-foreground/80" : "bg-muted-foreground/40",
            active && "animate-pulse",
            barClassName,
          )}
          style={{
            height: active ? `${8 + ((i * 3) % 10)}px` : "8px",
            animationDelay: active ? `${i * 80}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
