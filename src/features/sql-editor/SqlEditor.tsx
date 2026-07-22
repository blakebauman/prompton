import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  CircleHelp,
  Copy,
  Play,
  Square,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { KeyCapChord } from "@/components/key-cap";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { RUN_SQL_EVENT } from "@/hooks/use-app-shortcuts";
import { formatSql } from "@/lib/format-sql";
import { api } from "@/lib/tauri";
import type { PendingConfirmation } from "@/lib/types";
import { useShortcuts } from "@/stores/shortcuts";
import { useWorkspace } from "@/stores/workspace";

export function SqlEditor() {
  const {
    sql,
    setSql,
    activeConnId,
    connections,
    running,
    setRunning,
    setResult,
    setStatus,
    setExplainPlan,
    result,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const runSqlChord = useShortcuts((s) => s.bindings.runSql);

  const active = connections.find((c) => c.id === activeConnId);
  const isProd = !!active?.isProduction;
  const mutating = looksMutating(sql);

  async function executeRead() {
    if (!activeConnId) {
      setStatus("Select a connection first");
      return;
    }
    setRunning(true);
    setStatus("Running…");
    try {
      const page = await api.runQuery({
        connId: activeConnId,
        sql,
        pageSize: 500,
      });
      setResult(page);
      openArtifact("results");
      const msg = `Done · ${page.totalRows} rows · ${page.durationMs}ms`;
      setStatus(msg);
      toast({ title: "Query finished", description: msg, tone: "success" });
    } catch (e) {
      setStatus(String(e));
      toast({ title: "Query failed", description: String(e), tone: "error" });
    } finally {
      setRunning(false);
    }
  }

  async function explain() {
    if (!activeConnId) {
      setStatus("Select a connection first");
      return;
    }
    try {
      const plan = await api.explainQuery(activeConnId, sql);
      setExplainPlan(plan);
      openArtifact("explain");
      setStatus("Explain plan ready");
      toast({ title: "Explain ready", tone: "success" });
    } catch (e) {
      setStatus(String(e));
      toast({ title: "Explain failed", description: String(e), tone: "error" });
    }
  }

  async function run() {
    if (!activeConnId) {
      setStatus("Select a connection first");
      return;
    }
    if (mutating) {
      try {
        const staged = await api.requestWriteApproval(activeConnId, sql);
        setPending(staged);
      } catch (e) {
        setStatus(String(e));
      }
      return;
    }
    await executeRead();
  }

  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    function onRunSql() {
      void runRef.current();
    }
    window.addEventListener(RUN_SQL_EVENT, onRunSql);
    return () => window.removeEventListener(RUN_SQL_EVENT, onRunSql);
  }, []);

  async function resolvePending(approved: boolean) {
    if (!pending) return;
    const id = pending.confirmationId;
    setPending(null);
    if (!approved) {
      await api.confirmWrite(id, false);
      setStatus("Write rejected");
      return;
    }
    setRunning(true);
    setStatus(isProd ? "Running approved production write…" : "Running…");
    try {
      const page = await api.confirmWrite(id, true);
      if (page) {
        setResult(page);
        openArtifact("results");
        setStatus(
          `Write approved · ${page.affectedRows ?? page.totalRows} affected · ${page.durationMs}ms`,
        );
      }
    } catch (e) {
      setStatus(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function copySql() {
    if (!sql.trim()) return;
    try {
      await navigator.clipboard.writeText(sql);
      toast({ title: "SQL copied", tone: "success" });
    } catch {
      toast({ title: "Couldn’t copy SQL", tone: "error" });
    }
  }

  function onFormat() {
    const next = formatSql(sql);
    if (next === sql.trim()) {
      toast({ title: "Already formatted" });
      return;
    }
    setSql(next);
    toast({ title: "SQL formatted", tone: "success" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <span className="flex min-w-0 items-center gap-2 truncate px-1 text-[11px] text-muted-foreground">
          {activeConnId ? (
            <>
              <span className="truncate font-medium text-foreground">
                {active?.name ?? "Connection"}
              </span>
              <span aria-hidden>·</span>
              <span className="capitalize">{active?.dialect ?? "sql"}</span>
              <span aria-hidden>·</span>
              {mutating ? (
                <span className="text-destructive">Write · approval</span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <KeyCapChord keys={runSqlChord} className="scale-90" />
                  <span>run</span>
                </span>
              )}
            </>
          ) : (
            "Select a connection to run"
          )}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {running && result?.queryId && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void api.cancelQuery(result.queryId)}
            >
              <Square className="size-3.5" />
              Cancel
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            disabled={!sql.trim()}
            onClick={() => void copySql()}
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!sql.trim()}
            onClick={onFormat}
          >
            <AlignLeft className="size-3.5" />
            Format
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void explain()}
            disabled={running || !activeConnId || !sql.trim()}
          >
            <CircleHelp className="size-3.5" />
            Explain
          </Button>
          <Button
            size="xs"
            variant={mutating ? "destructive" : "default"}
            onClick={() => void run()}
            disabled={running || !activeConnId || !sql.trim()}
          >
            <Play className="size-3.5" />
            {mutating ? "Review" : "Run"}
          </Button>
        </div>
      </div>
      <Textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="SELECT …"
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0 focus-visible:shadow-[inset_3px_0_0_0_var(--foreground)]"
        spellCheck={false}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run();
          }
        }}
      />

      <WriteConfirmDialog
        open={!!pending}
        sql={pending?.sql ?? sql}
        reason={pending?.reason}
        isProduction={pending?.isProduction}
        adminWritesUnlocked={pending?.adminWritesUnlocked}
        onReject={() => void resolvePending(false)}
        onApprove={() => void resolvePending(true)}
      />
    </div>
  );
}

function looksMutating(sql: string): boolean {
  const first = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  return ![
    "SELECT",
    "WITH",
    "SHOW",
    "EXPLAIN",
    "DESCRIBE",
    "DESC",
    "PRAGMA",
    "VALUES",
  ].includes(first);
}
