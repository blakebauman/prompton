import { api } from "@/lib/tauri";
import { cancelActiveQuery } from "@/lib/run-query";
import {
  defaultConnectionMessages,
  deleteConnDraft,
  flushPersistActiveDraft,
  loadWorkspaceSnapshot,
  persistActiveDraft,
  readConnDraft,
  saveWorkspaceSnapshot,
} from "@/lib/workspace-persist";
import { useWorkspace } from "@/stores/workspace";

async function cancelInflightWork() {
  const s = useWorkspace.getState();
  if (s.sessionId) {
    try {
      await api.agentCancel(s.sessionId);
    } catch {
      /* ignore */
    }
  }
  if (s.running && s.activeQueryId) {
    try {
      await cancelActiveQuery();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Cancel in-flight agent/query work and clear connection-scoped UI state.
 * Persists the current draft first so SQL/chat survive the switch.
 */
export async function abandonConnectionWork() {
  flushPersistActiveDraft();
  await cancelInflightWork();
  useWorkspace.getState().resetChatForConnection();
}

/**
 * Switch the active connection: save the current draft, cancel work,
 * then restore that connection’s SQL/chat (or defaults).
 */
export async function switchActiveConnection(
  nextId: string | null,
  opts?: { persistCurrent?: boolean },
) {
  const s = useWorkspace.getState();
  if (s.activeConnId === nextId) {
    await cancelInflightWork();
    return;
  }

  if (opts?.persistCurrent !== false) {
    flushPersistActiveDraft();
  }
  await cancelInflightWork();

  if (nextId) {
    const draft = readConnDraft(nextId);
    useWorkspace.setState({
      activeConnId: nextId,
      sql: draft?.sql?.trim() ? draft.sql : "SELECT 1;",
      messages: draft?.messages?.length
        ? draft.messages
        : defaultConnectionMessages(),
      sessionId: draft?.sessionId ?? null,
      agentBusy: false,
      running: false,
      activeQueryId: null,
      result: null,
      explainPlan: null,
      pendingConfirm: null,
      contextReport: null,
      composerDraft: null,
    });
    saveWorkspaceSnapshot({ activeConnId: nextId });
  } else {
    const orphanSql = loadWorkspaceSnapshot().orphanSql || "SELECT 1;";
    useWorkspace.setState({
      activeConnId: null,
      sql: orphanSql,
      agentBusy: false,
      running: false,
      activeQueryId: null,
      result: null,
      explainPlan: null,
      pendingConfirm: null,
      contextReport: null,
      composerDraft: null,
      sessionId: null,
      messages: [
        {
          id: "welcome",
          role: "assistant",
          content:
            "I'm Prompton. Connect a database, then ask in natural language or write SQL directly.",
        },
      ],
    });
    saveWorkspaceSnapshot({ activeConnId: null });
  }

  persistActiveDraft();
}

/** Drop a connection’s saved draft (e.g. after remove). */
export function forgetConnectionDraft(connId: string) {
  deleteConnDraft(connId);
}

/** True when an agent event belongs to the session the UI is currently bound to. */
export function isCurrentAgentSession(sessionId?: string | null): boolean {
  if (!sessionId) return false;
  return useWorkspace.getState().sessionId === sessionId;
}
