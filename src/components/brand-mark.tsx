import { Database } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Show the wordmark next to the mark. */
  wordmark?: boolean;
  size?: "sm" | "md";
};

/**
 * Compact Prompton mark (Lucide database). Use with wordmark where the
 * agent/product identity should lead; mark-only for dense chrome.
 */
export function BrandMark({
  className,
  wordmark = true,
  size = "md",
}: BrandMarkProps) {
  const shell = size === "sm" ? "size-5" : "size-6";
  const icon = size === "sm" ? "size-3" : "size-3.5";
  const name = size === "sm" ? "text-sm" : "text-base";

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2", className)}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-foreground",
          shell,
        )}
        aria-hidden
      >
        <Database className={icon} strokeWidth={2.25} />
      </span>
      {wordmark && (
        <span className={cn("font-semibold tracking-tight", name)}>
          Prompton
        </span>
      )}
    </span>
  );
}

/** Category line for shell chrome when the wordmark lives on the agent. */
export const PRODUCT_TAGLINE = "Desktop database client";
