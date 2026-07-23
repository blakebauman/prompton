import {
  Braces,
  ChartColumn,
  Copy,
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
import { ExpandableClamp } from "@/components/expandable-clamp";
import { UnderlineTab, UnderlineTabs } from "@/components/underline-tabs";
import { Button } from "@/components/ui/button";
import { ResultsChart } from "@/features/results/ResultsChart";
import { ResultsGrid } from "@/features/results/ResultsGrid";
import { SchemaPanel } from "@/features/schema/SchemaPanel";
import { SqlEditor } from "@/features/sql-editor/SqlEditor";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/tauri";
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

/** Viewer pane: underline tabs for Results/Chart/SQL/Schema/Explain/Context. */
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
    <aside className="@container flex h-full w-full flex-col overflow-hidden bg-muted/30">
      <header className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-border/60 px-2">
        <UnderlineTabs>
          {SWITCHABLE.map(({ kind, label, icon: Icon }) => {
            const selected = artifact.kind === kind;
            return (
              <UnderlineTab
                key={kind}
                active={selected}
                onClick={() => {
                  if (kind !== artifact.kind) open(kind);
                }}
                aria-label={label}
                title={label}
                className="h-9 gap-1 px-1.5 @min-[520px]:px-2"
              >
                <Icon className="size-3.5 opacity-80" />
                <span className="hidden @min-[520px]:inline">{label}</span>
              </UnderlineTab>
            );
          })}
        </UnderlineTabs>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          onClick={close}
          aria-label="Close viewer"
        >
          <X className="size-3.5" />
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
            <div className="flex h-full flex-col overflow-hidden">
              {explainPlan ? (
                <>
                  <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
                    <span className="truncate px-1 text-[11px] text-muted-foreground">
                      Explain plan
                    </span>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(explainPlan).then(
                          () =>
                            toast({
                              title: "Explain copied",
                              tone: "success",
                            }),
                          () =>
                            toast({
                              title: "Couldn’t copy",
                              tone: "error",
                            }),
                        );
                      }}
                    >
                      <Copy className="size-3.5" />
                      Copy
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
                    <ExpandableClamp maxHeight={480}>
                      <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                        {explainPlan}
                      </pre>
                    </ExpandableClamp>
                  </div>
                </>
              ) : (
                <div className="p-3">
                  <EmptyArtifact
                    title="No explain plan"
                    description="Run Explain from SQL, or ask the agent to explain a query."
                    actions={
                      <>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => open("sql")}
                        >
                          <FileCode2 className="size-3.5" />
                          Open SQL
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
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
                                toast({
                                  title: "Explain ready",
                                  tone: "success",
                                });
                              } catch (e) {
                                useWorkspace.getState().setStatus(String(e));
                                toast({
                                  title: "Explain failed",
                                  description: String(e),
                                  tone: "error",
                                });
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
                </div>
              )}
            </div>
          )}
          {artifact.kind === "context" && (
            <div className="h-full overflow-y-auto overflow-x-hidden">
              <div className="space-y-3 p-3">
                {contextReport ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {contextReport.totalChars}
                        </span>{" "}
                        chars
                        {contextReport.truncated ? " · truncated" : ""} sent to
                        the model
                      </p>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          const text = contextReport.slices
                            .map(
                              (s) =>
                                `## ${s.label} (${s.chars})\n${s.content}`,
                            )
                            .join("\n\n");
                          void navigator.clipboard.writeText(text).then(
                            () =>
                              toast({
                                title: "Context copied",
                                tone: "success",
                              }),
                            () =>
                              toast({
                                title: "Couldn’t copy",
                                tone: "error",
                              }),
                          );
                        }}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                    </div>
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
                        <ExpandableClamp maxHeight={180} className="mt-2">
                          <pre className="whitespace-pre-wrap text-muted-foreground">
                            {s.content}
                          </pre>
                        </ExpandableClamp>
                      </details>
                    ))}
                  </>
                ) : (
                  <EmptyArtifact
                    title="No agent context yet"
                    description="After an assistant turn, inspect what Prompton sent to the model."
                  />
                )}
              </div>
            </div>
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
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
      <div className="max-w-sm space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground text-pretty">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {actions}
        </div>
      )}
    </div>
  );
}
