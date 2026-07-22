import type { ComponentProps, FormEvent, KeyboardEvent } from "react";
import { Loader2Icon, SendIcon, SquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Slim PromptInput adapted from fold.run / Vercel AI Elements.
 * Full multimodal PromptInput is ~1.3k LOC; Prompton MVP needs text + submit/stop.
 */

export type PromptInputProps = ComponentProps<"form">;

export function PromptInput({ className, ...props }: PromptInputProps) {
  return (
    <form
      className={cn(
        "w-full divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-background",
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputTextareaProps = ComponentProps<typeof Textarea> & {
  onSubmit?: () => void;
};

export function PromptInputTextarea({
  className,
  onSubmit,
  onKeyDown,
  ...props
}: PromptInputTextareaProps) {
  return (
    <Textarea
      className={cn(
        "min-h-[64px] w-full resize-none rounded-none border-0 bg-transparent p-3 shadow-none focus-visible:ring-0",
        className,
      )}
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
      className={cn("flex items-center justify-between gap-2 p-2", className)}
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
