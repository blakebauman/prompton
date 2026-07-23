import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  CircleHelp,
  Copy,
  Play,
  Square,
} from "lucide-react";

import { useArtifact } from "@/components/artifact/artifact-context";
import { DialectIcon, dialectLabel } from "@/components/brand-icon";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  CANCEL_QUERY_EVENT,
  FORMAT_SQL_EVENT,
  RUN_SQL_EVENT,
} from "@/hooks/use-app-shortcuts";
import {
  handleMaybeLostConnection,
  isConnectionLostError,
} from "@/lib/connection-health";
import { formatSql } from "@/lib/format-sql";
import { displayLabelForKey, sortChordKeys } from "@/lib/key-codes";
import {
  cancelActiveQuery,
  confirmCancellableWrite,
  isQueryCancelled,
  runCancellableQuery,
} from "@/lib/run-query";
import { isMutatingSql, splitSqlStatements } from "@/lib/sql-mutate";
import { api } from "@/lib/tauri";
import type { PendingConfirmation } from "@/lib/types";
import { useShortcuts } from "@/stores/shortcuts";
import { useWorkspace } from "@/stores/workspace";

function chordLabel(keys: string[]): string {
  return sortChordKeys(keys).map(displayLabelForKey).join("");
}

export function SqlEditor() {
  const {
    sql,
    setSql,
    activeConnId,
    connections,
    running,
    activeQueryId,
    setResult,
    setStatus,
    setExplainPlan,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const runSqlChord = useShortcuts((s) => s.bindings.runSql);
  const formatSqlChord = useShortcuts((s) => s.bindings.formatSql);

  const active = connections.find((c) => c.id === activeConnId);
  const isProd = !!active?.isProduction;
  const statementCount = splitSqlStatements(sql).length;
  const mutating = isMutatingSql(sql);

  // Connection switch / abandon discards backend stages — drop the local dialog too.
  useEffect(() => {
    setPending(null);
  }, [activeConnId]);

  async function executeRead() {
    if (!activeConnId) {
      setStatus("Select a connection first");
      return;
    }
    setStatus("Running…");
    try {
      const page = await runCancellableQuery({
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
      if (isQueryCancelled(e)) {
        setStatus("Query cancelled");
        toast({ title: "Query cancelled" });
        return;
      }
      if (isConnectionLostError(e)) return;
      setStatus(String(e));
      toast({ title: "Query failed", description: String(e), tone: "error" });
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
      if (await handleMaybeLostConnection(e, activeConnId)) return;
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
        toast({
          title: "Couldn’t stage write",
          description: String(e),
          tone: "error",
        });
      }
      return;
    }
    await executeRead();
  }

  async function resolvePending(approved: boolean) {
    if (!pending) return;
    const id = pending.confirmationId;
    setPending(null);
    if (!approved) {
      await confirmCancellableWrite(id, false);
      setStatus("Write rejected");
      toast({ title: "Write rejected" });
      return;
    }
    setStatus(isProd ? "Running approved production write…" : "Running…");
    try {
      const page = await confirmCancellableWrite(id, true);
      if (page) {
        setResult(page);
        openArtifact("results");
        const msg = `Write applied · ${page.affectedRows ?? page.totalRows} affected · ${page.durationMs}ms`;
        setStatus(msg);
        toast({ title: "Write applied", description: msg, tone: "success" });
      } else {
        setStatus("Write applied");
        toast({ title: "Write applied", tone: "success" });
      }
    } catch (e) {
      if (isQueryCancelled(e)) {
        setStatus("Query cancelled");
        toast({ title: "Query cancelled" });
        return;
      }
      if (isConnectionLostError(e)) return;
      setStatus(String(e));
      toast({
        title: "Write failed",
        description: String(e),
        tone: "error",
      });
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

  const runRef = useRef(run);
  runRef.current = run;
  const formatRef = useRef(onFormat);
  formatRef.current = onFormat;

  useEffect(() => {
    function onRunSql() {
      void runRef.current();
    }
    function onFormatSql() {
      formatRef.current();
    }
    function onCancelQuery() {
      void cancelActiveQuery();
    }
    window.addEventListener(RUN_SQL_EVENT, onRunSql);
    window.addEventListener(FORMAT_SQL_EVENT, onFormatSql);
    window.addEventListener(CANCEL_QUERY_EVENT, onCancelQuery);
    return () => {
      window.removeEventListener(RUN_SQL_EVENT, onRunSql);
      window.removeEventListener(FORMAT_SQL_EVENT, onFormatSql);
      window.removeEventListener(CANCEL_QUERY_EVENT, onCancelQuery);
    };
  }, []);

  const runTitle = mutating
    ? "Review write"
    : `Run${runSqlChord.length ? ` · ${chordLabel(runSqlChord)}` : ""}`;
  const formatTitle = `Format${
    formatSqlChord.length ? ` · ${chordLabel(formatSqlChord)}` : ""
  }`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate px-1 text-[11px] text-muted-foreground">
          {activeConnId ? (
            <>
              <span className="truncate font-medium text-foreground">
                {active?.name ?? "Connection"}
              </span>
              {active?.dialect ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <DialectIcon
                      dialect={active.dialect}
                      className="size-3 opacity-80"
                    />
                    {dialectLabel(active.dialect)}
                  </span>
                </>
              ) : null}
              {mutating ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-destructive">
                    {statementCount > 1
                      ? `${statementCount} stmts · write`
                      : "Write · approval"}
                  </span>
                </>
              ) : statementCount > 1 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{statementCount} stmts</span>
                </>
              ) : null}
            </>
          ) : (
            "Select a connection to run"
          )}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {running && activeQueryId && (
            <Button
              size="icon-xs"
              variant="ghost"
              title="Cancel query"
              aria-label="Cancel query"
              onClick={() => void cancelActiveQuery()}
            >
              <Square className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            title="Copy SQL"
            aria-label="Copy SQL"
            disabled={!sql.trim()}
            onClick={() => void copySql()}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            title={formatTitle}
            aria-label={formatTitle}
            disabled={!sql.trim()}
            onClick={onFormat}
          >
            <AlignLeft className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            title="Explain"
            aria-label="Explain query"
            onClick={() => void explain()}
            disabled={running || !activeConnId || !sql.trim()}
          >
            <CircleHelp className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant={mutating ? "destructive" : "default"}
            title={runTitle}
            aria-label={runTitle}
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
