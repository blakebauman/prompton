import type { ComponentProps, ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "size" | "children"> & {
  icon: ComponentType<{ className?: string }>;
};

/** Compact square icon control for dense toolbars and list rows. */
export function IconButton({
  className,
  icon: Icon,
  variant = "ghost",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size="icon-xs"
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}
