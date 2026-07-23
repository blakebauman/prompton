import { useEffect, useState } from "react";
import {
  Copy,
  DatabaseIcon,
  FileCode2,
  Lock,
  MessageSquarePlus,
  Server,
  Settings2,
  SquareIcon,
} from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  promptFormSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  artifactActionIcon,
  type ToolState,
} from "@/components/ai-elements/tool";
import { ActionNotice } from "@/components/action-notice";
import { ActivityPulse } from "@/components/activity-pulse";
import { useArtifact } from "@/components/artifact/artifact-context";
import { DialectIcon, dialectLabel } from "@/components/brand-icon";
import { BrandMark } from "@/components/brand-mark";
import { SetupChecklist } from "@/components/setup-checklist";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  historyForAgentResume,
  looksLikeToolCallDump,
} from "@/lib/agent-history";
import {
  isCurrentAgentSession,
  switchActiveConnection,
} from "@/lib/session";
import { api, onEvent } from "@/lib/tauri";
import { summarizeToolResult, toolResultState } from "@/lib/tool-summary";
import type { ChatMessage, PendingConfirmation, QueryPage } from "@/lib/types";
import { useWorkspace } from "@/stores/workspace";

const SUGGESTIONS = [
  {
    label: "List tables",
    prompt: "What tables and schemas are available?",
  },
  {
    label: "Sample a table",
    prompt: "Sample the widest table safely",
  },
  {
    label: "Draft SELECT + explain",
    prompt: "Draft a SELECT with LIMIT and explain it",
  },
] as const;

/** Database assistant panel (natural language → schema/SQL tools). */
export function AssistantPanel({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
} = {}) {
  const {
    messages,
    addMessage,
    finalizeRunningTools,
    activeConnId,
    connections,
    sessionId,
    setSessionId,
    agentBusy,
    setAgentBusy,
    pendingConfirm,
    setPendingConfirm,
    setResult,
    setStatus,
    setSql,
    setConnections,
    setSchemas,
    clearChat,
    composerDraft,
    setComposerDraft,
    sessionResumeNotice,
    setSessionResumeNotice,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [input, setInput] = useState("");
  const active = connections.find((c) => c.id === activeConnId);

  useEffect(() => {
    if (composerDraft == null) return;
    setInput(composerDraft);
    setComposerDraft(null);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>("[data-assistant-composer]")
        ?.focus();
    });
  }, [composerDraft, setComposerDraft]);

  async function connectDemo() {
    try {
      setStatus("Seeding demo database…");
      const [info, page] = await api.openDemoSqlite();
      setConnections(await api.listConnections());
      await switchActiveConnection(info.id);
      setSchemas(await api.listSchemas(info.id));
      setSql(
        "SELECT id, user_id, status, total_cents, placed_at FROM orders ORDER BY id;",
      );
      setResult(page);
      openArtifact("results");
      const msg = `Demo ready · ${page.totalRows.toLocaleString()} orders`;
      setStatus(msg);
      toast({ title: "Demo ready", description: msg, tone: "success" });
    } catch (e) {
      setStatus(String(e));
      toast({
        title: "Demo failed",
        description: String(e),
        tone: "error",
      });
    }
  }

  useEffect(() => {
    // Async listen setup races with Strict Mode remount: cleanup can run
    // before unlisten fns exist, leaving orphan handlers that double-apply
    // every agent:delta (duplicated assistant text without a second LLM call).
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    async function subscribe<T>(
      event: string,
      handler: (payload: T) => void,
    ) {
      const unlisten = await onEvent<T>(event, handler);
      if (cancelled) {
        unlisten();
        return;
      }
      unsubs.push(unlisten);
    }

    void (async () => {
      await subscribe<{ sessionId: string; delta: string }>(
        "agent:delta",
        (p) => {
          if (!isCurrentAgentSession(p.sessionId)) return;
          useWorkspace.getState().appendAssistant(p.delta);
        },
      );
      await subscribe<{
        sessionId: string;
        id?: string;
        name: string;
        result: string;
      }>("agent:tool_result", (p) => {
        if (!isCurrentAgentSession(p.sessionId)) return;
        const ws = useWorkspace.getState();
        const toolState = toolResultState(p.result);
        const id = p.id ? `tool-${p.id}` : null;
        const existing = id
          ? ws.messages.find((m) => m.id === id)
          : null;
        if (existing) {
          ws.patchMessage(existing.id, {
            content: p.result,
            toolState,
            toolName: p.name,
          });
        } else {
          ws.addMessage({
            id: id ?? `tool-${Date.now()}`,
            role: "tool",
            toolName: p.name,
            content: p.result,
            toolState,
          });
        }
        if (
          p.name === "explain_query" &&
          p.result &&
          toolState !== "output-error"
        ) {
          ws.setExplainPlan(p.result);
        }
      });
      await subscribe<{
        sessionId: string;
        id?: string;
        name: string;
        arguments: string;
      }>("agent:tool_call", (p) => {
        if (!isCurrentAgentSession(p.sessionId)) return;
        const ws = useWorkspace.getState();
        const id = p.id ? `tool-${p.id}` : `call-${Date.now()}`;
        ws.addMessage({
          id,
          role: "tool",
          toolName: p.name,
          content: "",
          toolArgs: p.arguments,
          toolState: "input-available",
        });
        // Only jump the artifact pane for SQL-bearing tools; schema/explain
        // stay in chat until the user opens them from the card.
        if (p.name === "run_query" || p.name === "sample_rows") {
          try {
            const args = JSON.parse(p.arguments) as { sql?: string };
            if (args.sql) {
              ws.setSql(args.sql);
              openArtifact("sql");
            }
          } catch {
            /* ignore */
          }
        }
      });
      await subscribe<PendingConfirmation>("agent:confirm", (p) => {
        const ws = useWorkspace.getState();
        if (p.connId && ws.activeConnId && p.connId !== ws.activeConnId) {
          return;
        }
        if (p.sessionId && !isCurrentAgentSession(p.sessionId)) return;
        if (p.toolCallId) {
          const toolId = `tool-${p.toolCallId}`;
          if (ws.messages.some((m) => m.id === toolId)) {
            ws.patchMessage(toolId, { toolState: "approval-requested" });
          }
        } else {
          // Fallback: mark the newest running run_query card.
          const running = [...ws.messages]
            .reverse()
            .find(
              (m) =>
                m.role === "tool" &&
                m.toolName === "run_query" &&
                (m.toolState === "input-available" ||
                  m.toolState === "input-streaming"),
            );
          if (running) {
            ws.patchMessage(running.id, { toolState: "approval-requested" });
          }
        }
        ws.setPendingConfirm(p);
        ws.setStatus("Awaiting write approval");
      });
      await subscribe<{ sessionId: string }>("agent:done", async (p) => {
        if (!isCurrentAgentSession(p.sessionId)) return;
        const ws = useWorkspace.getState();
        ws.setAgentBusy(false);
        ws.setStatus("Assistant idle");
        if (p.sessionId) {
          const report = await api.agentLastContext(p.sessionId);
          if (cancelled || !isCurrentAgentSession(p.sessionId)) return;
          useWorkspace.getState().setContextReport(report);
        }
        const msgs = useWorkspace.getState().messages;
        const lastUser = [...msgs].reverse().find((m) => m.role === "user");
        const lastAssistant = [...msgs]
          .reverse()
          .find((m) => m.role === "assistant" && m.id !== "welcome");
        if (lastUser) {
          const conn = useWorkspace
            .getState()
            .connections.find(
              (c) => c.id === useWorkspace.getState().activeConnId,
            );
          void api
            .recordHistory({
              kind: "agent",
              title: lastUser.content,
              body: lastUser.content,
              detail: lastAssistant?.content ?? null,
              connId: conn?.id ?? null,
              connName: conn?.name ?? null,
              status: "ok",
              meta: p.sessionId ? { sessionId: p.sessionId } : null,
            })
            .catch(() => {});
        }
      });
      await subscribe<{ sessionId: string; error: string }>(
        "agent:error",
        (p) => {
          if (!isCurrentAgentSession(p.sessionId)) return;
          const ws = useWorkspace.getState();
          ws.setAgentBusy(false);
          if (p.error === "Cancelled") {
            ws.finalizeRunningTools("output-denied");
            ws.setStatus("Assistant cancelled");
            return;
          }
          ws.finalizeRunningTools("output-error");
          ws.addMessage({
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `Error: ${p.error}`,
          });
          ws.setStatus(p.error);
          const conn = ws.connections.find((c) => c.id === ws.activeConnId);
          const lastUser = [...ws.messages]
            .reverse()
            .find((m) => m.role === "user");
          void api
            .recordHistory({
              kind: "agent",
              title: lastUser?.content ?? "Agent error",
              body: lastUser?.content ?? p.error,
              detail: p.error,
              connId: conn?.id ?? null,
              connName: conn?.name ?? null,
              status: "error",
              meta: { sessionId: p.sessionId },
            })
            .catch(() => {});
        },
      );
      await subscribe<QueryPage>("query:result", (page) => {
        // Agent-only event; ignore leftovers after connection switch.
        const s = useWorkspace.getState();
        if (!s.agentBusy && !s.sessionId) return;
        s.setResult(page);
        openArtifact("results");
        const conn = s.connections.find((c) => c.id === s.activeConnId);
        void api
          .recordHistory({
            kind: "query",
            title: page.sql.trim().split("\n")[0] ?? "Query",
            body: page.sql,
            connId: conn?.id ?? null,
            connName: conn?.name ?? null,
            status: "ok",
            meta: {
              totalRows: page.totalRows,
              durationMs: page.durationMs,
            },
          })
          .catch(() => {});
      });
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [openArtifact]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || !activeConnId || agentBusy) return;
    if (!textOverride) setInput("");

    // Bind a live session before the first delta. Dead ids (app restart) get a
    // fresh session seeded from the visible transcript.
    const prior = useWorkspace.getState().messages;
    let nextSession = sessionId;
    let history: ReturnType<typeof historyForAgentResume> = [];
    if (nextSession) {
      let alive = false;
      try {
        alive = await api.agentHasSession(nextSession);
      } catch {
        alive = false;
      }
      if (!alive) {
        nextSession = crypto.randomUUID();
        history = historyForAgentResume(prior);
      }
    } else {
      nextSession = crypto.randomUUID();
      history = historyForAgentResume(prior);
    }

    setSessionId(nextSession);
    setSessionResumeNotice(null);
    addMessage({ id: `u-${Date.now()}`, role: "user", content: text });
    setAgentBusy(true);
    setStatus("Assistant thinking…");
    try {
      const id = await api.agentChat({
        sessionId: nextSession,
        connId: activeConnId,
        message: text,
        history,
      });
      setSessionId(id);
    } catch (e) {
      setAgentBusy(false);
      setStatus(String(e));
      addMessage({
        id: `err-${Date.now()}`,
        role: "assistant",
        content: String(e),
      });
    }
  }

  const status = agentBusy ? "streaming" : "ready";
  const showEmpty =
    messages.length <= 1 &&
    messages[0]?.id === "welcome" &&
    !messages[0]?.content.includes("reset");
  const showWorkingPlaceholder =
    agentBusy &&
    !messages.some(
      (m) =>
        (m.role === "assistant" && m.id.startsWith("stream-")) ||
        (m.role === "tool" &&
          (m.toolState === "input-available" ||
            m.toolState === "input-streaming" ||
            m.toolState === "approval-requested" ||
            m.toolState === "approval-responded")),
    );

  function stopAgent() {
    if (sessionId) {
      void api.agentCancel(sessionId).catch(() => {});
    }
    if (pendingConfirm?.confirmationId) {
      void api
        .discardPendingWrite({ confirmationId: pendingConfirm.confirmationId })
        .catch(() => {});
    }
    setPendingConfirm(null);
    finalizeRunningTools("output-denied");
    setAgentBusy(false);
    setStatus("Assistant cancelled");
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-background to-transparent" />
      <div className="relative z-20 flex h-10 shrink-0 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {agentBusy && <ActivityPulse mode="busy" />}
          <h2 className="min-w-0" aria-label="Prompton">
            <BrandMark size="md" />
          </h2>
          {active && (
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <span className="truncate">{active.name}</span>
              <span aria-hidden>·</span>
              <DialectIcon dialect={active.dialect} className="size-3 opacity-80" />
              <span>{dialectLabel(active.dialect)}</span>
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-0.5">
          {agentBusy && (
            <Button size="xs" variant="ghost" onClick={stopAgent}>
              <SquareIcon className="size-3.5" />
              Stop
            </Button>
          )}
          {activeConnId && !showEmpty && (
            <Button
              size="xs"
              variant="ghost"
              disabled={agentBusy}
              onClick={() => {
                if (sessionId) {
                  void api.agentCancel(sessionId).catch(() => {});
                }
                if (pendingConfirm?.confirmationId) {
                  void api
                    .discardPendingWrite({
                      confirmationId: pendingConfirm.confirmationId,
                      sessionId,
                    })
                    .catch(() => {});
                }
                setPendingConfirm(null);
                clearChat();
                setStatus("New thread");
                toast({ title: "New assistant thread" });
              }}
            >
              <MessageSquarePlus className="size-3.5" />
              New thread
            </Button>
          )}
        </div>
      </div>

      <Conversation className="min-h-0">
        <ConversationContent className="gap-2 px-4 pt-1 pb-4">
          {!activeConnId ? (
            <div className="flex flex-1 items-center justify-center px-2 py-6">
              <SetupChecklist
                title="Connect a database first"
                description="The assistant inspects schema, drafts SQL, and runs reads against your connection."
                items={[
                  {
                    id: "database",
                    title: "Connect a database",
                    description:
                      "Add Postgres, MySQL, or SQLite in Connections, or open the seeded demo.",
                    ready: false,
                    icon: <DatabaseIcon className="size-3.5" />,
                    action: (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="xs"
                          onClick={() => void connectDemo()}
                        >
                          Open demo SQLite
                        </Button>
                      </div>
                    ),
                  },
                  {
                    id: "provider",
                    title: "Configure a model provider",
                    description:
                      "Local Ollama by default. Open Settings if you need a remote API.",
                    ready: false,
                    icon: <Server className="size-3.5" />,
                    action: onOpenSettings ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={onOpenSettings}
                      >
                        <Settings2 className="size-3.5" />
                        Open Settings
                      </Button>
                    ) : undefined,
                  },
                ]}
              />
            </div>
          ) : showEmpty ? (
            <ConversationEmptyState
              icon={
                <BrandMark wordmark={false} size="md" className="opacity-70" />
              }
              title="Ask Prompton"
              description="Schema, samples, EXPLAIN, and safe SELECTs — writes pause for approval."
            >
              <Suggestions className="mt-1 max-w-md">
                {SUGGESTIONS.map((s) => (
                  <Suggestion
                    key={s.label}
                    suggestion={s.prompt}
                    onClick={(value) => void send(value)}
                  >
                    {s.label}
                  </Suggestion>
                ))}
              </Suggestions>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <ChatBubble key={m.id} message={m} streaming={agentBusy} />
            ))
          )}
          {showWorkingPlaceholder && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Working…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="space-y-2 border-t border-border/60 p-2.5">
        {sessionResumeNotice && (
          <ActionNotice
            tone="neutral"
            className="px-2.5 py-2"
            title="Context will reload"
            description={sessionResumeNotice}
          />
        )}
        {active?.isProduction && !active.adminWritesUnlocked && (
          <ActionNotice
            tone="prod"
            className="px-2.5 py-2"
            icon={<Lock className="size-3.5" />}
            title="Production writes need approval"
            description="Mutating SQL pauses for your approval. Admin unlock is not required."
          />
        )}
        <PromptInput
          frosted
          onSubmit={(e) =>
            promptFormSubmit(e, () => {
              if (activeConnId) void send();
            })
          }
        >
          <PromptInputTextarea
            data-assistant-composer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeConnId
                ? "Ask about schema, data, or SQL…"
                : "Connect a database to use the assistant…"
            }
            disabled={!activeConnId || agentBusy}
            onSubmit={() => {
              if (activeConnId) void send();
            }}
          />
          <PromptInputFooter>
            <span className="px-1 text-[11px] text-muted-foreground/70">
              {activeConnId
                ? "↵ send · ⇧↵ newline"
                : "Connect to enable the assistant"}
            </span>
            <PromptInputSubmit
              status={status}
              disabled={
                !activeConnId ||
                (status !== "streaming" && (!input.trim() || agentBusy))
              }
              onClick={(e) => {
                if (status === "streaming") {
                  e.preventDefault();
                  stopAgent();
                }
              }}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>

      <WriteConfirmDialog
        open={!!pendingConfirm}
        sql={pendingConfirm?.sql ?? ""}
        reason={pendingConfirm?.reason}
        isProduction={pendingConfirm?.isProduction}
        adminWritesUnlocked={pendingConfirm?.adminWritesUnlocked}
        onReject={() =>
          void (async () => {
            if (!pendingConfirm) return;
            const id = pendingConfirm.confirmationId;
            const toolId = pendingConfirm.toolCallId
              ? `tool-${pendingConfirm.toolCallId}`
              : null;
            if (toolId) {
              useWorkspace
                .getState()
                .patchMessage(toolId, { toolState: "approval-responded" });
            }
            setPendingConfirm(null);
            try {
              setStatus("Write rejected — agent continuing…");
              await api.agentConfirm(id, false);
              toast({
                title: "Write rejected",
                description: "Agent will continue",
              });
            } catch (e) {
              setAgentBusy(false);
              setStatus(String(e));
              toast({
                title: "Couldn’t reject write",
                description: String(e),
                tone: "error",
              });
            }
          })()
        }
        onApprove={() =>
          void (async () => {
            if (!pendingConfirm) return;
            const id = pendingConfirm.confirmationId;
            const prod = !!pendingConfirm.isProduction;
            const toolId = pendingConfirm.toolCallId
              ? `tool-${pendingConfirm.toolCallId}`
              : null;
            if (toolId) {
              useWorkspace
                .getState()
                .patchMessage(toolId, { toolState: "approval-responded" });
            }
            setPendingConfirm(null);
            try {
              setStatus(
                prod
                  ? "Production write approved — agent continuing…"
                  : "Write approved — agent continuing…",
              );
              await api.agentConfirm(id, true);
              toast({
                title: "Write approved",
                description: prod
                  ? "Production statement approved — agent continuing"
                  : "Agent will continue",
                tone: "success",
              });
            } catch (e) {
              setAgentBusy(false);
              setStatus(String(e));
              toast({
                title: "Couldn’t approve write",
                description: String(e),
                tone: "error",
              });
            }
          })()
        }
      />
    </div>
  );
}

function ChatBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  const { open: openArtifact } = useArtifact();
  const setSql = useWorkspace((s) => s.setSql);

  // Safety net: hide assistant bubbles that are only tool-call JSON.
  if (
    message.role === "assistant" &&
    looksLikeToolCallDump(message.content)
  ) {
    return null;
  }

  if (message.role === "tool") {
    const state = (message.toolState ??
      (message.content ? "output-available" : "input-available")) as ToolState;
    let input: unknown = message.toolArgs;
    try {
      if (typeof message.toolArgs === "string") {
        input = JSON.parse(message.toolArgs);
      }
    } catch {
      input = message.toolArgs;
    }
    const artifactKind = artifactKindForTool(message.toolName);
    const sql =
      input &&
      typeof input === "object" &&
      input !== null &&
      "sql" in input &&
      typeof (input as { sql?: unknown }).sql === "string"
        ? (input as { sql: string }).sql
        : undefined;
    const sqlSubtitle = sql?.trim().replace(/\s+/g, " ");
    const summary = message.content
      ? summarizeToolResult(message.toolName, message.content, input)
      : {};
    const subtitle =
      state === "approval-requested"
        ? "Needs write approval"
        : summary.subtitle || sqlSubtitle;
    const ArtifactIcon = artifactKind
      ? artifactActionIcon(artifactKind)
      : null;
    const running =
      state === "input-available" ||
      state === "input-streaming" ||
      state === "approval-requested" ||
      state === "approval-responded";
    const done = state === "output-available";

    const headerActions =
      sql || (artifactKind && done && ArtifactIcon) ? (
        <>
          {sql ? (
            <>
              <Button
                size="icon-xs"
                variant="ghost"
                title="Open SQL"
                aria-label="Open SQL in editor"
                onClick={() => {
                  setSql(sql);
                  openArtifact("sql");
                }}
              >
                <FileCode2 className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                title="Copy SQL"
                aria-label="Copy SQL"
                onClick={() => {
                  void navigator.clipboard.writeText(sql).then(
                    () => toast({ title: "SQL copied", tone: "success" }),
                    () => toast({ title: "Couldn’t copy", tone: "error" }),
                  );
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </>
          ) : null}
          {artifactKind && done && ArtifactIcon ? (
            <Button
              size="icon-xs"
              variant="ghost"
              title={`Open ${artifactKind}`}
              aria-label={`Open ${artifactKind}`}
              onClick={() => openArtifact(artifactKind)}
            >
              <ArtifactIcon className="size-3.5" />
            </Button>
          ) : null}
        </>
      ) : undefined;

    return (
      <Tool defaultOpen={running || state === "output-error"}>
        <ToolHeader
          title={message.toolName ?? "tool"}
          toolName={message.toolName}
          state={state}
          subtitle={subtitle}
          actions={headerActions}
        />
        <ToolContent>
          {input != null && input !== "" && <ToolInput input={input} />}
          {summary.kind === "schema" && summary.schema && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Columns
              </h4>
              <ul className="max-h-36 space-y-0.5 overflow-auto rounded-md border border-border/50 bg-background/60 px-2 py-1.5 font-mono text-[11px]">
                {summary.schema.columns.map((c) => (
                  <li key={c.name} className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-foreground">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {c.dataType}
                    </span>
                    {c.isPrimaryKey && (
                      <span className="shrink-0 text-muted-foreground">PK</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.kind === "rows" && summary.rowsPreview && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Preview
              </h4>
              <pre className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {[
                  summary.rowsPreview.columns.join(" · "),
                  ...summary.rowsPreview.rows.map((r) => r.join(" · ")),
                  summary.rowsPreview.omitted
                    ? `… ${summary.rowsPreview.omitted} more rows omitted`
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </pre>
            </div>
          )}
          {message.content &&
            summary.kind !== "schema" &&
            summary.kind !== "rows" && (
              <ToolOutput
                output={
                  state === "output-error" ? undefined : message.content
                }
                errorText={
                  state === "output-error" ? message.content : undefined
                }
              />
            )}
        </ToolContent>
      </Tool>
    );
  }

  if (message.role === "system") {
    return (
      <div className="px-0.5 text-[11px] text-muted-foreground">
        {message.content}
      </div>
    );
  }

  const from = message.role === "user" ? "user" : "assistant";
  const canCopy = message.content.trim().length > 0;
  const showCaret =
    streaming &&
    from === "assistant" &&
    message.id.startsWith("stream-");

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast({ title: "Copied", tone: "success" });
    } catch {
      toast({ title: "Couldn’t copy", tone: "error" });
    }
  }

  return (
    <Message from={from} className="gap-1.5">
      <MessageContent
        className={
          from === "user"
            ? "px-2.5 py-1.5 text-[13px] leading-snug"
            : "gap-1.5 text-[13px] leading-snug"
        }
      >
        {from === "assistant" ? (
          <div className="relative">
            <MessageResponse>{message.content}</MessageResponse>
            {showCaret && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 bg-foreground/70 animate-pulse"
              />
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </MessageContent>
      {canCopy && !showCaret && (
        <MessageActions
          className={
            from === "user"
              ? "justify-end opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
              : "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          }
        >
          <MessageAction
            tooltip="Copy"
            label="Copy message"
            size="icon-xs"
            onClick={() => void copyMessage()}
          >
            <Copy className="size-3.5" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}

function artifactKindForTool(
  toolName?: string,
): "results" | "sql" | "schema" | "explain" | null {
  switch (toolName) {
    case "run_query":
    case "sample_rows":
      return "results";
    case "inspect_schema":
      return "schema";
    case "explain_query":
      return "explain";
    default:
      return null;
  }
}

/** @deprecated Prefer AssistantPanel */
export const ChatPanel = AssistantPanel;
