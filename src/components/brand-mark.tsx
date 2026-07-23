import { PromptonMarkIcon } from "@/components/prompton-mark-icon";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Show the wordmark next to the mark. */
  wordmark?: boolean;
  size?: "sm" | "md";
};

/**
 * Compact Prompton mark (database cylinder). Use with wordmark where the
 * agent/product identity should lead; mark-only for dense chrome.
 */
export function BrandMark({
  className,
  wordmark = true,
  size = "md",
}: BrandMarkProps) {
  // Compact chrome mark for h-9 headers; md is slightly larger for empty states.
  const shell = size === "sm" ? "size-6" : "size-7";
  const icon = size === "sm" ? "size-3.5" : "size-4";
  const name = size === "sm" ? "text-sm" : "text-base";

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2", className)}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-foreground",
          shell,
        )}
        aria-hidden
      >
        <PromptonMarkIcon className={icon} />
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
