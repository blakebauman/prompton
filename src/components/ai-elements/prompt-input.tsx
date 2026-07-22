import {
  useEffect,
  useState,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Loader2Icon, SendIcon, SquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Slim PromptInput adapted from fold.run / Vercel AI Elements.
 * Full multimodal PromptInput is ~1.3k LOC; Prompton MVP needs text + submit/stop.
 */

export type PromptInputProps = ComponentProps<"form"> & {
  /** Frosted glass shell for the chat composer. */
  frosted?: boolean;
};

export function PromptInput({
  className,
  frosted = false,
  ...props
}: PromptInputProps) {
  return (
    <form
      className={cn(
        "w-full divide-y overflow-hidden rounded-xl border transition-colors duration-200",
        frosted
          ? "surface-frosted divide-border/40 border-transparent"
          : "divide-border/60 border-border/60 bg-background",
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputTextareaProps = ComponentProps<typeof Textarea> & {
  onSubmit?: () => void;
  /** Expand on focus; collapse on blur when empty. */
  expandOnFocus?: boolean;
};

export function PromptInputTextarea({
  className,
  onSubmit,
  onKeyDown,
  onFocus,
  onBlur,
  expandOnFocus = true,
  value,
  ...props
}: PromptInputTextareaProps) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = String(value ?? "").trim().length > 0;

  useEffect(() => {
    if (!expandOnFocus) return;
    if (hasContent) setExpanded(true);
  }, [hasContent, expandOnFocus]);

  return (
    <Textarea
      value={value}
      className={cn(
        "w-full resize-none rounded-none border-0 bg-transparent px-3 shadow-none",
        "field-sizing-content focus-visible:border-transparent focus-visible:ring-0",
        "placeholder:text-muted-foreground/60 dark:bg-transparent",
        "transition-[min-height,padding] duration-150 ease-out",
        expandOnFocus
          ? expanded
            ? "min-h-[88px] max-h-[220px] overflow-y-auto py-3"
            : "min-h-10 max-h-10 overflow-hidden py-2.5"
          : "min-h-[64px] py-3",
        className,
      )}
      onFocus={(e) => {
        if (expandOnFocus) setExpanded(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        if (expandOnFocus && !hasContent) setExpanded(false);
        onBlur?.(e);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
        onKeyDown?.(e);
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit?.();
        }
      }}
      {...props}
    />
  );
}

export type PromptInputFooterProps = ComponentProps<"div">;

export function PromptInputFooter({
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <div
      className={cn("flex items-center justify-between gap-2 px-2 py-1.5", className)}
      {...props}
    />
  );
}

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: "ready" | "submitted" | "streaming" | "error";
};

export function PromptInputSubmit({
  className,
  status = "ready",
  children,
  ...props
}: PromptInputSubmitProps) {
  const busy = status === "submitted" || status === "streaming";
  return (
    <Button
      className={cn("gap-1.5", className)}
      size="sm"
      type="submit"
      {...props}
    >
      {children ??
        (busy ? (
          status === "streaming" ? (
            <SquareIcon className="size-3.5" />
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" />
          )
        ) : (
          <SendIcon className="size-3.5" />
        ))}
    </Button>
  );
}

export function promptFormSubmit(
  e: FormEvent<HTMLFormElement>,
  handler: () => void,
) {
  e.preventDefault();
  handler();
}
