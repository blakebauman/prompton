import { handleMaybeLostConnection } from "@/lib/connection-health";
import { api } from "@/lib/tauri";
import type { QueryPage, RunQueryRequest } from "@/lib/types";
import { useWorkspace } from "@/stores/workspace";

export function isQueryCancelled(err: unknown): boolean {
  return String(err).toLowerCase().includes("cancel");
}

export async function cancelActiveQuery(): Promise<void> {
  const { activeQueryId, setStatus } = useWorkspace.getState();
  if (!activeQueryId) return;
  try {
    await api.cancelQuery(activeQueryId);
    setStatus("Cancelling…");
  } catch (e) {
    setStatus(String(e));
  }
}

/** Run a query with a client queryId so Cancel works before completion. */
export async function runCancellableQuery(
  request: Omit<RunQueryRequest, "queryId"> & { queryId?: string },
): Promise<QueryPage> {
  const queryId = request.queryId ?? crypto.randomUUID();
  const ws = useWorkspace.getState();
  ws.setActiveQueryId(queryId);
  ws.setRunning(true);
  try {
    return await api.runQuery({ ...request, queryId });
  } catch (e) {
    await handleMaybeLostConnection(e, request.connId);
    throw e;
  } finally {
    const cur = useWorkspace.getState();
    if (cur.activeQueryId === queryId) {
      cur.setActiveQueryId(null);
      cur.setRunning(false);
    }
  }
}

/** Approve a staged write with a cancellable query id. */
export async function confirmCancellableWrite(
  confirmationId: string,
  approved: boolean,
): Promise<QueryPage | null> {
  if (!approved) {
    return api.confirmWrite(confirmationId, false);
  }
  const queryId = crypto.randomUUID();
  const ws = useWorkspace.getState();
  const connId = ws.activeConnId;
  ws.setActiveQueryId(queryId);
  ws.setRunning(true);
  try {
    return await api.confirmWrite(confirmationId, true, queryId);
  } catch (e) {
    await handleMaybeLostConnection(e, connId);
    throw e;
  } finally {
    const cur = useWorkspace.getState();
    if (cur.activeQueryId === queryId) {
      cur.setActiveQueryId(null);
      cur.setRunning(false);
    }
  }
}
