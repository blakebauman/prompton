import type { ComponentProps, HTMLAttributes } from "react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <div
    className={cn("flex flex-wrap items-center gap-1.5", className)}
    {...props}
  >
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "xs",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn(
        "cursor-pointer font-normal text-muted-foreground",
        className,
      )}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
