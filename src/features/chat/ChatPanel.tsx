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
import { SetupChecklist } from "@/components/setup-checklist";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  isCurrentAgentSession,
  switchActiveConnection,
} from "@/lib/session";
import { api, onEvent } from "@/lib/tauri";
import type { ChatMessage, PendingConfirmation, QueryPage } from "@/lib/types";
import { useWorkspace } from "@/stores/workspace";

const SUGGESTIONS = [
  "What tables are in this database?",
  "Show me a sample of the largest table",
  "Write a safe SELECT with a LIMIT",
];

export function ChatPanel({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
} = {}) {
  const {
    messages,
    addMessage,
    patchMessage,
    finalizeRunningTools,
    appendAssistant,
    activeConnId,
    connections,
    sessionId,
    setSessionId,
    agentBusy,
    setAgentBusy,
    pendingConfirm,
    setPendingConfirm,
    setResult,
    setContextReport,
    setStatus,
    setSql,
    setConnections,
    setSchemas,
    clearChat,
    composerDraft,
    setComposerDraft,
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
        .querySelector<HTMLTextAreaElement>("[data-chat-composer]")
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
    const unsubs: Array<() => void> = [];
    void (async () => {
      unsubs.push(
        await onEvent<{ sessionId: string; delta: string }>(
          "agent:delta",
          (p) => {
            if (!isCurrentAgentSession(p.sessionId)) return;
            appendAssistant(p.delta);
          },
        ),
      );
      unsubs.push(
        await onEvent<{
          sessionId: string;
          id?: string;
          name: string;
          result: string;
        }>("agent:tool_result", (p) => {
          if (!isCurrentAgentSession(p.sessionId)) return;
          const toolState = p.result.trim().startsWith("Error:")
            ? ("output-error" as const)
            : ("output-available" as const);
          const id = p.id ? `tool-${p.id}` : null;
          const existing = id
            ? useWorkspace.getState().messages.find((m) => m.id === id)
            : null;
          if (existing) {
            patchMessage(existing.id, {
              content: p.result,
              toolState,
              toolName: p.name,
            });
          } else {
            addMessage({
              id: id ?? `tool-${Date.now()}`,
              role: "tool",
              toolName: p.name,
              content: p.result,
              toolState,
            });
          }
          if (p.name === "explain_query" && p.result && toolState !== "output-error") {
            useWorkspace.getState().setExplainPlan(p.result);
          }
        }),
      );
      unsubs.push(
        await onEvent<{
          sessionId: string;
          id?: string;
          name: string;
          arguments: string;
        }>("agent:tool_call", (p) => {
          if (!isCurrentAgentSession(p.sessionId)) return;
          const id = p.id ? `tool-${p.id}` : `call-${Date.now()}`;
          addMessage({
            id,
            role: "tool",
            toolName: p.name,
            content: "",
            toolArgs: p.arguments,
            toolState: "input-available",
          });
          if (p.name === "run_query" || p.name === "sample_rows") {
            try {
              const args = JSON.parse(p.arguments) as { sql?: string };
              if (args.sql) {
                setSql(args.sql);
                openArtifact("sql");
              }
            } catch {
              /* ignore */
            }
          } else if (p.name === "inspect_schema" || p.name === "list_tables") {
            openArtifact("schema");
          } else if (p.name === "explain_query") {
            openArtifact("explain");
          }
        }),
      );
      unsubs.push(
        await onEvent<PendingConfirmation>("agent:confirm", (p) => {
          const active = useWorkspace.getState().activeConnId;
          if (p.connId && active && p.connId !== active) return;
          if (p.sessionId && !isCurrentAgentSession(p.sessionId)) return;
          setPendingConfirm(p);
        }),
      );
      unsubs.push(
        await onEvent<{ sessionId: string }>("agent:done", async (p) => {
          if (!isCurrentAgentSession(p.sessionId)) return;
          setAgentBusy(false);
          setStatus("Agent idle");
          if (p.sessionId) {
            const report = await api.agentLastContext(p.sessionId);
            setContextReport(report);
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
        }),
      );
      unsubs.push(
        await onEvent<{ sessionId: string; error: string }>(
          "agent:error",
          (p) => {
            if (!isCurrentAgentSession(p.sessionId)) return;
            setAgentBusy(false);
            if (p.error === "Cancelled") {
              finalizeRunningTools("output-denied");
              setStatus("Agent cancelled");
              return;
            }
            finalizeRunningTools("output-error");
            addMessage({
              id: `err-${Date.now()}`,
              role: "assistant",
              content: `Error: ${p.error}`,
            });
            setStatus(p.error);
            const s = useWorkspace.getState();
            const conn = s.connections.find((c) => c.id === s.activeConnId);
            const lastUser = [...s.messages]
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
        ),
      );
      unsubs.push(
        await onEvent<QueryPage>("query:result", (page) => {
          // Agent-only event; ignore leftovers after connection switch.
          const s = useWorkspace.getState();
          if (!s.agentBusy && !s.sessionId) return;
          setResult(page);
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
        }),
      );
    })();
    return () => unsubs.forEach((u) => u());
  }, [
    addMessage,
    appendAssistant,
    finalizeRunningTools,
    openArtifact,
    patchMessage,
    setAgentBusy,
    setContextReport,
    setPendingConfirm,
    setResult,
    setSql,
    setStatus,
  ]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || !activeConnId || agentBusy) return;
    if (!textOverride) setInput("");
    // Bind session id before the first delta so events can be filtered.
    const nextSession = sessionId ?? crypto.randomUUID();
    setSessionId(nextSession);
    addMessage({ id: `u-${Date.now()}`, role: "user", content: text });
    setAgentBusy(true);
    setStatus("Agent thinking…");
    try {
      const id = await api.agentChat({
        sessionId: nextSession,
        connId: activeConnId,
        message: text,
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
            m.toolState === "input-streaming")),
    );

  function stopAgent() {
    if (sessionId) void api.agentCancel(sessionId);
    finalizeRunningTools("output-denied");
    setAgentBusy(false);
    setStatus("Agent cancelled");
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-background to-transparent" />
      <div className="relative z-20 flex h-10 shrink-0 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2">
          {agentBusy && <ActivityPulse mode="busy" />}
          <h2 className="text-base font-bold tracking-tight">Chat</h2>
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
                if (sessionId) void api.agentCancel(sessionId);
                clearChat();
                setStatus("New chat");
                toast({ title: "Chat cleared" });
              }}
            >
              <MessageSquarePlus className="size-3.5" />
              New
            </Button>
          )}
        </div>
      </div>

      <Conversation className="min-h-0">
        <ConversationContent className="gap-3 px-4 pt-1 pb-4">
          {!activeConnId ? (
            <div className="flex flex-1 items-center justify-center px-2 py-6">
              <SetupChecklist
                title="Get ready to chat"
                description="Connect a database, then ask in natural language or SQL."
                items={[
                  {
                    id: "database",
                    title: "Connect a database",
                    description:
                      "Add Postgres or SQLite in Connections, or open the seeded demo.",
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
              icon={<DatabaseIcon className="size-7 opacity-40" />}
              title="Ask Prompton"
              description="Natural language or SQL. The agent keeps context small and inspectable."
            />
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
        {active?.isProduction && !active.adminWritesUnlocked && (
          <ActionNotice
            tone="prod"
            className="px-2.5 py-2"
            icon={<Lock className="size-3.5" />}
            title="Production is read-only"
            description="Mutations pause for approval until you unlock admin writes."
          />
        )}
        {activeConnId && showEmpty && (
          <Suggestions className="px-0.5">
            {SUGGESTIONS.map((s) => (
              <Suggestion
                key={s}
                suggestion={s}
                onClick={(value) => void send(value)}
              />
            ))}
          </Suggestions>
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
            data-chat-composer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeConnId
                ? "Ask about your data…"
                : "Connect a database to start chatting…"
            }
            disabled={!activeConnId || agentBusy}
            onSubmit={() => {
              if (activeConnId) void send();
            }}
          />
          <PromptInputFooter>
            <span className="px-1 text-[11px] text-muted-foreground/70">
              {activeConnId ? "↵ send · ⇧↵ newline" : "Connect to enable chat"}
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
            setPendingConfirm(null);
            try {
              await api.agentConfirm(id, false);
              setAgentBusy(false);
              setStatus("Write rejected");
              toast({ title: "Write rejected" });
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
            setPendingConfirm(null);
            try {
              await api.agentConfirm(id, true);
              setStatus(
                prod
                  ? "Production write approved — agent continuing…"
                  : "Write approved — agent continuing…",
              );
              toast({
                title: "Write approved",
                description: prod
                  ? "Production statement approved"
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
    const ArtifactIcon = artifactKind
      ? artifactActionIcon(artifactKind)
      : null;
    const running =
      state === "input-available" || state === "input-streaming";
    const done = state === "output-available";

    return (
      <Tool defaultOpen={running || state === "output-error"}>
        <ToolHeader
          title={message.toolName ?? "tool"}
          toolName={message.toolName}
          state={state}
          subtitle={sqlSubtitle}
        />
        <ToolContent>
          {input != null && input !== "" && <ToolInput input={input} />}
          {(message.content || state === "output-error") && (
            <ToolOutput
              output={message.content || undefined}
              errorText={
                state === "output-error" ? message.content : undefined
              }
            />
          )}
          <div className="flex flex-wrap items-center gap-1">
            {sql && (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setSql(sql);
                    openArtifact("sql");
                  }}
                >
                  <FileCode2 className="size-3.5" />
                  Open SQL
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(sql).then(
                      () => toast({ title: "SQL copied", tone: "success" }),
                      () =>
                        toast({ title: "Couldn’t copy", tone: "error" }),
                    );
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy SQL
                </Button>
              </>
            )}
            {artifactKind && done && ArtifactIcon && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => openArtifact(artifactKind)}
              >
                <ArtifactIcon className="size-3.5" />
                Open {artifactKind}
              </Button>
            )}
          </div>
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

function looksLikeToolCallDump(content: string): boolean {
  const t = content.trim();
  if (!t.startsWith("{")) return false;
  try {
    const obj = JSON.parse(t) as { name?: string; arguments?: unknown };
    return typeof obj.name === "string" && "arguments" in obj;
  } catch {
    // Concatenated JSON objects
    return /^\{\s*"name"\s*:/.test(t) && t.includes('"arguments"');
  }
}
