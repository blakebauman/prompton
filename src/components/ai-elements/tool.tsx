import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "approval-requested"
  | "approval-responded"
  | "output-denied";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group not-prose mb-2 w-full rounded-md border border-border/60 bg-muted/20",
      className,
    )}
    {...props}
  />
);

const statusLabels: Record<ToolState, string> = {
  "approval-requested": "Awaiting approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolState, ReactNode> = {
  "approval-requested": <ClockIcon className="size-3.5 text-muted-foreground" />,
  "approval-responded": (
    <CheckCircleIcon className="size-3.5 text-muted-foreground" />
  ),
  "input-available": (
    <ClockIcon className="size-3.5 animate-pulse text-foreground" />
  ),
  "input-streaming": <CircleIcon className="size-3.5 text-muted-foreground" />,
  "output-available": (
    <CheckCircleIcon className="size-3.5 text-success" />
  ),
  "output-denied": <XCircleIcon className="size-3.5 text-muted-foreground" />,
  "output-error": <XCircleIcon className="size-3.5 text-destructive" />,
};

export const getStatusBadge = (status: ToolState) => (
  <Badge
    className={cn(
      "gap-1 rounded-md px-1.5 py-0 text-[10px] font-medium",
      status === "output-error" && "text-destructive",
      status === "output-available" && "text-success",
    )}
    variant="secondary"
  >
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export type ToolHeaderProps = {
  title: string;
  state: ToolState;
  className?: string;
};

export const ToolHeader = ({
  className,
  title,
  state,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-3 px-3 py-2.5",
      className,
    )}
    {...props}
  >
    <div className="flex min-w-0 items-center gap-2">
      <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium">{title}</span>
      {getStatusBadge(state)}
    </div>
    <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn("space-y-3 px-3 pt-0 pb-3 text-popover-foreground", className)}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">
      Parameters
    </h4>
    <pre className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-xs">
      {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
    </pre>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: unknown;
  errorText?: string;
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) return null;

  let body: ReactNode = <div>{output as ReactNode}</div>;
  if (typeof output === "object" && !isValidElement(output)) {
    body = (
      <pre className="max-h-48 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-xs">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  } else if (typeof output === "string") {
    body = (
      <pre className="max-h-48 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-xs whitespace-pre-wrap">
        {output}
      </pre>
    );
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto text-xs",
          errorText && "text-destructive",
        )}
      >
        {errorText && <div className="mb-2">{errorText}</div>}
        {body}
      </div>
    </div>
  );
};
