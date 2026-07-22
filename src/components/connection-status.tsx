import type { ConnectionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type ConnectionStatusProps = {
  connected: boolean;
  isProduction?: boolean;
  className?: string;
  /** Show a short Connected / Offline label beside the dot. */
  withLabel?: boolean;
};

/**
 * Connection liveness mark.
 * Green when connected; muted when offline. Production stays a separate badge.
 */
export function ConnectionStatus({
  connected,
  className,
  withLabel = false,
}: ConnectionStatusProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={connected ? "Connected" : "Disconnected"}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          connected
            ? "bg-success shadow-[0_0_0_2px_color-mix(in_oklab,var(--success)_30%,transparent)]"
            : "bg-muted-foreground/35",
        )}
        aria-hidden
      />
      {withLabel && (
        <span
          className={cn(
            "text-[11px]",
            connected ? "text-success" : "text-muted-foreground",
          )}
        >
          {connected ? "Connected" : "Offline"}
        </span>
      )}
    </span>
  );
}

export function connectionStatusLabel(
  c: Pick<ConnectionInfo, "connected">,
): string {
  return c.connected ? "Connected" : "Disconnected";
}
