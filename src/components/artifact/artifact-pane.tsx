import {
  Braces,
  ChartColumn,
  FileCode2,
  ListTree,
  Network,
  Table2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  useArtifact,
  type ArtifactKind,
} from "@/components/artifact/artifact-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResultsChart } from "@/features/results/ResultsChart";
import { ResultsGrid } from "@/features/results/ResultsGrid";
import { SchemaPanel } from "@/features/schema/SchemaPanel";
import { SqlEditor } from "@/features/sql-editor/SqlEditor";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

const SWITCHABLE: ReadonlyArray<{
  kind: ArtifactKind;
  label: string;
  icon: typeof Table2;
}> = [
  { kind: "results", label: "Results", icon: Table2 },
  { kind: "chart", label: "Chart", icon: ChartColumn },
  { kind: "sql", label: "SQL", icon: FileCode2 },
  { kind: "schema", label: "Schema", icon: Network },
  { kind: "explain", label: "Explain", icon: ListTree },
  { kind: "context", label: "Context", icon: Braces },
];

/** Artifact inspector: underline tabs + switchable Results/Chart/SQL/Schema/Explain/Context. */
export function ArtifactPane() {
  const { state: artifact } = useArtifact();
  if (!artifact.open) return null;
  return <OpenArtifactPane />;
}

function OpenArtifactPane() {
  const { state: artifact, open, close } = useArtifact();
  const { explainPlan, contextReport, sql, activeConnId } = useWorkspace();

  if (!artifact.open) return null;

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-tl-xl border-l border-t border-border/60 bg-muted/30">
      <header className="flex shrink-0 items-end justify-between gap-1 border-b border-border/60 px-2 pt-1">
        <nav className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {SWITCHABLE.map(({ kind, label, icon: Icon }) => {
            const selected = artifact.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  if (kind !== artifact.kind) open(kind);
                }}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-xs font-medium transition-colors -mb-px",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                )}
                aria-current={selected ? "page" : undefined}
                aria-label={label}
                title={label}
              >
                <Icon className="size-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="mb-1 size-7 shrink-0 rounded-lg"
          onClick={close}
          aria-label="Close artifact pane"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="relative min-h-0 flex-1 bg-background">
        <div
          key={artifact.kind}
          className="absolute inset-0 flex flex-col animate-in fade-in duration-150"
        >
          {artifact.kind === "results" && <ResultsGrid />}
          {artifact.kind === "chart" && <ResultsChart />}
          {artifact.kind === "sql" && <SqlEditor />}
          {artifact.kind === "schema" && <SchemaPanel />}
          {artifact.kind === "explain" && (
            <ScrollArea className="h-full">
              <div className="p-3">
                {explainPlan ? (
                  <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                    {explainPlan}
                  </pre>
                ) : (
                  <EmptyArtifact
                    title="No explain plan"
                    description="Run Explain from SQL, or ask the agent to explain a query."
                    actions={
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => open("sql")}
                        >
                          <FileCode2 className="size-3.5" />
                          Open SQL
                        </Button>
                        <Button
                          size="sm"
                          disabled={!activeConnId || !sql.trim()}
                          onClick={() =>
                            void (async () => {
                              if (!activeConnId) return;
                              try {
                                const plan = await api.explainQuery(
                                  activeConnId,
                                  sql,
                                );
                                useWorkspace.getState().setExplainPlan(plan);
                                useWorkspace
                                  .getState()
                                  .setStatus("Explain plan ready");
                              } catch (e) {
                                useWorkspace.getState().setStatus(String(e));
                              }
                            })()
                          }
                        >
                          <ListTree className="size-3.5" />
                          Run Explain
                        </Button>
                      </>
                    }
                  />
                )}
              </div>
            </ScrollArea>
          )}
          {artifact.kind === "context" && (
            <ScrollArea className="h-full">
              <div className="space-y-3 p-3">
                {contextReport ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {contextReport.totalChars}
                      </span>{" "}
                      chars
                      {contextReport.truncated ? " · truncated" : ""} sent to the
                      model
                    </p>
                    {contextReport.slices.map((s) => (
                      <details
                        key={s.label}
                        className="rounded-lg border border-border/60 p-2 text-xs"
                        open
                      >
                        <summary className="cursor-pointer font-medium">
                          {s.label}{" "}
                          <span className="text-muted-foreground">
                            ({s.chars})
                          </span>
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-muted-foreground">
                          {s.content}
                        </pre>
                      </details>
                    ))}
                  </>
                ) : (
                  <EmptyArtifact
                    title="No agent context yet"
                    description="After a chat turn, inspect what Prompton sent to the model."
                  />
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </aside>
  );
}

function EmptyArtifact({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="max-w-sm space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground text-pretty">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
