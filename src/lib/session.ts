import { api } from "@/lib/tauri";
import { cancelActiveQuery } from "@/lib/run-query";
import { useWorkspace } from "@/stores/workspace";

/**
 * Cancel in-flight agent/query work and clear connection-scoped UI state.
 * Call before switching or removing the active connection.
 */
export async function abandonConnectionWork() {
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
  s.resetChatForConnection();
}

/** True when an agent event belongs to the session the UI is currently bound to. */
export function isCurrentAgentSession(sessionId?: string | null): boolean {
  if (!sessionId) return false;
  return useWorkspace.getState().sessionId === sessionId;
}
