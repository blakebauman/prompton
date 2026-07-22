import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-border/70 bg-transparent px-2.5 py-2 text-sm shadow-xs",
        "transition-[color,background-color,border-color,box-shadow] duration-150 outline-none",
        "placeholder:text-muted-foreground/70",
        "hover:border-border dark:bg-input/25 dark:hover:bg-input/35",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
