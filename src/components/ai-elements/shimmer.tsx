import { cn } from "@/lib/utils";

export interface TextShimmerProps {
  children: string;
  className?: string;
}

/** Lightweight CSS shimmer (fold.run uses motion; we keep deps lean). */
export function Shimmer({ children, className }: TextShimmerProps) {
  return (
    <span
      className={cn(
        "inline-block animate-pulse bg-gradient-to-r from-muted-foreground/40 via-foreground/80 to-muted-foreground/40 bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}
