import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/tauri";
import type { ConnectionInfo } from "@/lib/types";
import { useWorkspace } from "@/stores/workspace";

export function isConnectionLostError(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return (
    s.includes("connection lost") ||
    s.includes("connection is not active") ||
    s.includes("broken pipe") ||
    s.includes("connection reset") ||
    s.includes("connection refused") ||
    s.includes("server closed the connection") ||
    s.includes("connection closed") ||
    s.includes("pool timed out") ||
    s.includes("pool closed")
  );
}

export async function refreshConnections(): Promise<ConnectionInfo[]> {
  const list = await api.listConnections();
  useWorkspace.getState().setConnections(list);
  return list;
}

/** Reconnect a saved connection and refresh workspace connection state. */
export async function reconnectConnection(id: string): Promise<ConnectionInfo> {
  const info = await api.reconnectDb(id);
  await refreshConnections();
  return info;
}

/**
 * If `err` looks like a dropped transport, refresh connection list and toast.
 * Returns true when handled as a lost connection.
 */
export async function handleMaybeLostConnection(
  err: unknown,
  connId?: string | null,
): Promise<boolean> {
  if (!isConnectionLostError(err)) return false;
  try {
    await refreshConnections();
  } catch {
    /* ignore refresh failures */
  }
  const name = connId
    ? useWorkspace.getState().connections.find((c) => c.id === connId)?.name
    : undefined;
  toast({
    title: "Connection lost",
    description: name
      ? `${name} went offline. Reconnect to continue.`
      : "Reconnect to continue.",
    tone: "error",
  });
  useWorkspace.getState().setStatus(
    name ? `Offline · ${name}` : "Connection lost",
  );
  return true;
}

/** Light liveness check; marks Offline in the UI if the pool is dead. */
export async function ensureConnectionAlive(id: string): Promise<boolean> {
  try {
    await api.pingDb(id);
    return true;
  } catch (e) {
    await handleMaybeLostConnection(e, id);
    return false;
  }
}
