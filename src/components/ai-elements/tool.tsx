import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import {
  Braces,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  FileCode2,
  ListTree,
  Network,
  Table2,
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
      "group not-prose mb-1.5 w-full rounded-md border border-border/60 bg-muted/15",
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
  "output-available": "Done",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolState, ReactNode> = {
  "approval-requested": (
    <ClockIcon className="size-3 text-muted-foreground" />
  ),
  "approval-responded": (
    <CheckCircleIcon className="size-3 text-muted-foreground" />
  ),
  "input-available": (
    <ClockIcon className="size-3 animate-pulse text-foreground" />
  ),
  "input-streaming": <CircleIcon className="size-3 text-muted-foreground" />,
  "output-available": <CheckCircleIcon className="size-3 text-success" />,
  "output-denied": <XCircleIcon className="size-3 text-muted-foreground" />,
  "output-error": <XCircleIcon className="size-3 text-destructive" />,
};

/** Friendly label for agent tool names. */
export function toolDisplayName(name?: string | null): string {
  switch (name) {
    case "run_query":
      return "Run query";
    case "sample_rows":
      return "Sample rows";
    case "inspect_schema":
      return "Inspect schema";
    case "explain_query":
      return "Explain query";
    case "list_tables":
      return "List tables";
    default:
      return name?.replace(/_/g, " ") || "Tool";
  }
}

export function toolIcon(name?: string | null): ReactNode {
  switch (name) {
    case "run_query":
    case "sample_rows":
      return <Table2 className="size-3.5 shrink-0 text-muted-foreground" />;
    case "inspect_schema":
    case "list_tables":
      return <Network className="size-3.5 shrink-0 text-muted-foreground" />;
    case "explain_query":
      return <ListTree className="size-3.5 shrink-0 text-muted-foreground" />;
    default:
      return <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}

export const getStatusBadge = (status: ToolState) => (
  <Badge
    className={cn(
      "gap-1 rounded-md px-1.5 py-0 text-[10px] font-medium",
      status === "output-error" && "text-destructive",
      status === "output-available" && "text-success",
      status === "input-available" && "text-foreground",
      status === "approval-requested" && "text-foreground",
      status === "output-denied" && "text-muted-foreground",
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
  toolName?: string;
  subtitle?: string;
  className?: string;
};

export const ToolHeader = ({
  className,
  title,
  state,
  toolName,
  subtitle,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-2 px-2.5 py-2",
      className,
    )}
    {...props}
  >
    <div className="flex min-w-0 items-center gap-2">
      {toolIcon(toolName ?? title)}
      <div className="min-w-0 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium leading-none">
            {toolDisplayName(title)}
          </span>
          {getStatusBadge(state)}
        </div>
        {subtitle && (
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "space-y-2.5 border-t border-border/50 px-2.5 pt-2 pb-2.5 text-popover-foreground",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const sql =
    input &&
    typeof input === "object" &&
    input !== null &&
    "sql" in input &&
    typeof (input as { sql?: unknown }).sql === "string"
      ? (input as { sql: string }).sql
      : null;

  return (
    <div className={cn("space-y-1.5 overflow-hidden", className)} {...props}>
      <h4 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {sql ? "SQL" : "Parameters"}
      </h4>
      {sql ? (
        <pre className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {sql}
        </pre>
      ) : (
        <pre className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-[11px]">
          {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
};

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

  // Prefer the error text alone — callers often pass the same string as both.
  if (errorText) {
    return (
      <div className={cn("space-y-1.5", className)} {...props}>
        <h4 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Error
        </h4>
        <pre className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-destructive">
          {errorText}
        </pre>
      </div>
    );
  }

  let body: ReactNode = <div>{output as ReactNode}</div>;
  if (typeof output === "object" && !isValidElement(output)) {
    body = (
      <pre className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-[11px]">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  } else if (typeof output === "string") {
    body = (
      <pre className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {output}
      </pre>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Result
      </h4>
      <div className="overflow-x-auto text-xs">{body}</div>
    </div>
  );
};

/** Compact artifact open affordance icons. */
export function artifactActionIcon(
  kind: "results" | "sql" | "schema" | "explain" | "context",
) {
  switch (kind) {
    case "results":
      return Table2;
    case "sql":
      return FileCode2;
    case "schema":
      return Network;
    case "explain":
      return ListTree;
    case "context":
      return Braces;
  }
}
