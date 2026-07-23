import { create } from "zustand";

import type {
  BudgetReport,
  ChatMessage,
  ConnectionInfo,
  PendingConfirmation,
  QueryPage,
  SchemaNode,
} from "@/lib/types";

interface WorkspaceState {
  connections: ConnectionInfo[];
  activeConnId: string | null;
  schemas: SchemaNode[];
  sql: string;
  result: QueryPage | null;
  running: boolean;
  messages: ChatMessage[];
  sessionId: string | null;
  agentBusy: boolean;
  pendingConfirm: PendingConfirmation | null;
  contextReport: BudgetReport | null;
  explainPlan: string | null;
  status: string;

  setConnections: (c: ConnectionInfo[]) => void;
  setActiveConnId: (id: string | null) => void;
  setSchemas: (s: SchemaNode[]) => void;
  setSql: (sql: string) => void;
  setResult: (r: QueryPage | null) => void;
  setRunning: (v: boolean) => void;
  addMessage: (m: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  /** Mark in-flight tool cards as cancelled / errored. */
  finalizeRunningTools: (
    toolState: NonNullable<ChatMessage["toolState"]>,
  ) => void;
  appendAssistant: (delta: string) => void;
  setMessages: (m: ChatMessage[]) => void;
  setSessionId: (id: string | null) => void;
  setAgentBusy: (v: boolean) => void;
  setPendingConfirm: (p: PendingConfirmation | null) => void;
  setContextReport: (r: BudgetReport | null) => void;
  setExplainPlan: (plan: string | null) => void;
  setStatus: (s: string) => void;
  /** Clear the chat thread without wiping SQL results / explain. */
  clearChat: () => void;
  resetChatForConnection: () => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  connections: [],
  activeConnId: null,
  schemas: [],
  sql: "SELECT 1;",
  result: null,
  running: false,
  messages: [
    {
      id: "welcome",
      role: "assistant",
      content:
        "I'm Prompton. Connect a database, then ask in natural language or write SQL directly.",
    },
  ],
  sessionId: null,
  agentBusy: false,
  pendingConfirm: null,
  contextReport: null,
  explainPlan: null,
  status: "Ready",

  setConnections: (connections) => set({ connections }),
  setActiveConnId: (activeConnId) => set({ activeConnId }),
  setSchemas: (schemas) => set({ schemas }),
  setSql: (sql) => set({ sql }),
  setResult: (result) => set({ result }),
  setRunning: (running) => set({ running }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patchMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  finalizeRunningTools: (toolState) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === "tool" &&
        (m.toolState === "input-available" ||
          m.toolState === "input-streaming")
          ? { ...m, toolState }
          : m,
      ),
    })),
  appendAssistant: (delta) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.id.startsWith("stream-")) {
        msgs[msgs.length - 1] = { ...last, content: last.content + delta };
      } else {
        msgs.push({ id: `stream-${Date.now()}`, role: "assistant", content: delta });
      }
      return { messages: msgs };
    }),
  setMessages: (messages) => set({ messages }),
  setSessionId: (sessionId) => set({ sessionId }),
  setAgentBusy: (agentBusy) => set({ agentBusy }),
  setPendingConfirm: (pendingConfirm) => set({ pendingConfirm }),
  setContextReport: (contextReport) => set({ contextReport }),
  setExplainPlan: (explainPlan) => set({ explainPlan }),
  setStatus: (status) => set({ status }),
  clearChat: () =>
    set({
      sessionId: null,
      agentBusy: false,
      pendingConfirm: null,
      contextReport: null,
      messages: [
        {
          id: "welcome",
          role: "assistant",
          content: "New chat. Ask a question or run SQL.",
        },
      ],
    }),
  resetChatForConnection: () =>
    set({
      sessionId: null,
      agentBusy: false,
      running: false,
      result: null,
      explainPlan: null,
      pendingConfirm: null,
      contextReport: null,
      messages: [
        {
          id: "welcome",
          role: "assistant",
          content: "Connection context reset. Ask a question or run SQL.",
        },
      ],
    }),
}));
