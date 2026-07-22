import { useEffect, useState } from "react";
import {
  DatabaseIcon,
  Lock,
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
  type ToolState,
} from "@/components/ai-elements/tool";
import { ActionNotice } from "@/components/action-notice";
import { ActivityPulse } from "@/components/activity-pulse";
import { useArtifact } from "@/components/artifact/artifact-context";
import { SetupChecklist } from "@/components/setup-checklist";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { Button } from "@/components/ui/button";
import { abandonConnectionWork, isCurrentAgentSession } from "@/lib/session";
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
    setActiveConnId,
    setSchemas,
  } = useWorkspace();
  const { open: openArtifact } = useArtifact();
  const [input, setInput] = useState("");
  const active = connections.find((c) => c.id === activeConnId);

  async function connectDemo() {
    try {
      setStatus("Seeding demo database…");
      const [info, page] = await api.openDemoSqlite();
      setConnections(await api.listConnections());
      await abandonConnectionWork();
      setActiveConnId(info.id);
      setSchemas(await api.listSchemas(info.id));
      setSql(
        "SELECT id, user_id, status, total_cents, placed_at FROM orders ORDER BY id;",
      );
      setResult(page);
      openArtifact("results");
      setStatus(`Demo ready · ${page.totalRows.toLocaleString()} orders`);
    } catch (e) {
      setStatus(String(e));
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
          addMessage({
            id: `tool-${Date.now()}`,
            role: "tool",
            toolName: p.name,
            content: p.result,
            toolState: "output-available",
          });
          if (p.name === "explain_query" && p.result) {
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
          addMessage({
            id: `call-${Date.now()}`,
            role: "tool",
            toolName: p.name,
            content: "",
            toolArgs: p.arguments,
            toolState: "input-available",
          });
          if (p.name === "run_query") {
            try {
              const args = JSON.parse(p.arguments) as { sql?: string };
              if (args.sql) {
                setSql(args.sql);
                openArtifact("sql");
              }
            } catch {
              /* ignore */
            }
          } else if (p.name === "inspect_schema") {
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
              setStatus("Agent cancelled");
              return;
            }
            addMessage({
              id: `err-${Date.now()}`,
              role: "assistant",
              content: `Error: ${p.error}`,
            });
            setStatus(p.error);
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
    openArtifact,
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

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-background to-transparent" />
      <div className="relative z-20 flex h-10 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {agentBusy && <ActivityPulse mode="busy" />}
          <h2 className="text-base font-bold tracking-tight">Chat</h2>
        </div>
        {agentBusy && (
          <Button
            size="xs"
            variant="ghost"
            className="pointer-events-auto -mr-1"
            onClick={() => {
              if (sessionId) void api.agentCancel(sessionId);
              setAgentBusy(false);
            }}
          >
            <SquareIcon className="size-3.5" />
            Stop
          </Button>
        )}
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
            messages.map((m) => <ChatBubble key={m.id} message={m} />)
          )}
          {agentBusy && (
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
              disabled={!activeConnId || !input.trim() || agentBusy}
              onClick={(e) => {
                if (status === "streaming") {
                  e.preventDefault();
                  if (sessionId) void api.agentCancel(sessionId);
                  setAgentBusy(false);
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
            await api.agentConfirm(pendingConfirm.confirmationId, false);
            setPendingConfirm(null);
            setAgentBusy(false);
          })()
        }
        onApprove={() =>
          void (async () => {
            if (!pendingConfirm) return;
            await api.agentConfirm(pendingConfirm.confirmationId, true);
            setPendingConfirm(null);
          })()
        }
      />
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const { open: openArtifact } = useArtifact();

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
    return (
      <Tool defaultOpen={state !== "output-available"}>
        <ToolHeader title={message.toolName ?? "tool"} state={state} />
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
          {artifactKind && state === "output-available" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => openArtifact(artifactKind)}
            >
              Open in artifact
            </Button>
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
          <MessageResponse>{message.content}</MessageResponse>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </MessageContent>
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
