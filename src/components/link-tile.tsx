import type { ComponentType, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Bordered link tile for settings / about sections. */
export function LinkTile({
  href,
  title,
  subtitle,
  icon: Icon,
  className,
  children,
}: {
  href: string;
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center gap-3 rounded-md border border-border/60 p-3.5 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      {Icon && (
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      {children}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
      <ArrowUpRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </a>
  );
}
