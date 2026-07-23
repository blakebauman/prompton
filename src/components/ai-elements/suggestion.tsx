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
    className={cn(
      "flex flex-wrap items-center justify-center gap-1.5",
      className,
    )}
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
  variant = "secondary",
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
        "h-7 max-w-full cursor-pointer truncate px-2.5 text-[11px] font-normal text-muted-foreground",
        className,
      )}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      title={suggestion}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
