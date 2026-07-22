import type { ButtonHTMLAttributes, ComponentType } from "react";

import { cn } from "@/lib/utils";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ComponentType<{ className?: string }>;
};

/** Compact circular icon control for dense toolbars and list rows. */
export function IconButton({
  className,
  icon: Icon,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        "transition-colors hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5 text-muted-foreground" />
    </button>
  );
}
