import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap",
    "transition-[color,background-color,border-color,opacity,transform,box-shadow] duration-150",
    "outline-none select-none",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/80",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:bg-destructive/70 dark:hover:bg-destructive/80 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-border/70 bg-background text-foreground shadow-xs hover:bg-muted/60 hover:border-border dark:bg-transparent dark:hover:bg-muted/40",
        secondary:
          "border border-border/50 bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:border-border/70",
        ghost:
          "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:hover:bg-muted/50",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3.5 text-sm has-[>svg]:px-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs has-[>svg]:px-2",
        lg: "h-9 rounded-md px-4 text-sm has-[>svg]:px-3.5 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7",
        "icon-lg": "size-9 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
