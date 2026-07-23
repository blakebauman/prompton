import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AgentSettings,
  BudgetReport,
  ConnectRequest,
  ConnectionInfo,
  HistoryEntry,
  HistoryListFilter,
  PendingConfirmation,
  PromptEntry,
  QueryPage,
  RecordHistoryRequest,
  RunQueryRequest,
  SchemaNode,
  SkillMeta,
  TableDescription,
} from "./types";

/** True when running inside the Tauri webview (not plain Vite browser). */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export class DesktopRequiredError extends Error {
  constructor(command?: string) {
    super(
      command
        ? `Desktop runtime required (${command})`
        : "Desktop runtime required",
    );
    this.name = "DesktopRequiredError";
  }
}

export function isDesktopRequiredError(e: unknown): boolean {
  return (
    e instanceof DesktopRequiredError ||
    (e instanceof Error && e.name === "DesktopRequiredError") ||
    /Desktop runtime required|reading ['"]invoke['"]/i.test(String(e))
  );
}

async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new DesktopRequiredError(cmd);
  }
  return tauriInvoke<T>(cmd, args);
}

/**
 * Tauri renames Rust snake_case command args to camelCase for JS.
 * Nested request structs use serde `rename_all = "camelCase"` already.
 */
export const api = {
  listConnections: () => invoke<ConnectionInfo[]>("list_connections"),
  connectDb: (request: ConnectRequest) =>
    invoke<ConnectionInfo>("connect_db", { request }),
  reconnectDb: (id: string) => invoke<ConnectionInfo>("reconnect_db", { id }),
  pingDb: (id: string) => invoke<void>("ping_db", { id }),
  disconnectDb: (id: string) => invoke<void>("disconnect_db", { id }),
  removeConnection: (id: string) => invoke<void>("remove_connection", { id }),
  listSchemas: (id: string) => invoke<SchemaNode[]>("list_schemas", { id }),
  describeTable: (id: string, schema: string, table: string) =>
    invoke<TableDescription>("describe_table", { id, schema, table }),
  runQuery: (request: RunQueryRequest) =>
    invoke<QueryPage>("run_query", {
      request,
      allowMutating: false,
    }),
  requestWriteApproval: (
    connId: string,
    sql: string,
    sessionId?: string | null,
  ) =>
    invoke<PendingConfirmation>("request_write_approval", {
      connId,
      sql,
      sessionId: sessionId ?? null,
    }),
  confirmWrite: (
    confirmationId: string,
    approved: boolean,
    queryId?: string | null,
  ) =>
    invoke<QueryPage | null>("confirm_write", {
      confirmationId,
      approved,
      queryId: queryId ?? null,
    }),
  setConnectionProduction: (id: string, isProduction: boolean) =>
    invoke<ConnectionInfo>("set_connection_production", {
      id,
      isProduction,
    }),
  setAdminWritesUnlocked: (id: string, unlocked: boolean) =>
    invoke<ConnectionInfo>("set_admin_writes_unlocked", {
      id,
      unlocked,
    }),
  cancelQuery: (queryId: string) =>
    invoke<void>("cancel_query", { queryId }),
  fetchQueryPage: (queryId: string, offset: number, limit: number) =>
    invoke<QueryPage>("fetch_query_page", {
      queryId,
      offset,
      limit,
    }),
  explainQuery: (connId: string, sql: string) =>
    invoke<string>("explain_query", { connId, sql }),
  agentChat: (request: {
    sessionId?: string | null;
    connId: string;
    message: string;
  }) => invoke<string>("agent_chat", { request }),
  agentCancel: (sessionId: string) =>
    invoke<void>("agent_cancel", { sessionId }),
  discardPendingWrite: (args?: {
    confirmationId?: string | null;
    connId?: string | null;
    sessionId?: string | null;
  }) =>
    invoke<number>("discard_pending_write", {
      confirmationId: args?.confirmationId ?? null,
      connId: args?.connId ?? null,
      sessionId: args?.sessionId ?? null,
    }),
  agentConfirm: (confirmationId: string, approved: boolean) =>
    invoke<void>("agent_confirm", {
      confirmationId,
      approved,
    }),
  agentGetSettings: () => invoke<AgentSettings>("agent_get_settings"),
  agentSetSettings: (settings: AgentSettings, apiKey?: string) =>
    invoke<void>("agent_set_settings", {
      settings,
      apiKey,
    }),
  agentLastContext: (sessionId: string) =>
    invoke<BudgetReport | null>("agent_last_context", {
      sessionId,
    }),
  listOllamaModels: (baseUrl?: string) =>
    invoke<{ name: string; size?: number; supportsTools: boolean }[]>(
      "list_ollama_models",
      { baseUrl },
    ),
  listSkills: () => invoke<SkillMeta[]>("list_skills"),
  getSkill: (name: string) =>
    invoke<{ name: string; description: string; body: string; path: string }>(
      "get_skill",
      { name },
    ),
  saveSkill: (name: string, description: string, body: string) =>
    invoke<{ name: string; description: string; body: string; path: string }>(
      "save_skill",
      { name, description, body },
    ),
  listPrompts: () => invoke<PromptEntry[]>("list_prompts"),
  savePrompt: (title: string, body: string, id?: string) =>
    invoke<PromptEntry>("save_prompt", { id, title, body }),
  deletePrompt: (id: string) => invoke<void>("delete_prompt", { id }),
  listHistory: (filter?: HistoryListFilter | number) => {
    if (typeof filter === "number") {
      return invoke<HistoryEntry[]>("list_history", {
        filter: { limit: filter },
        limit: filter,
      });
    }
    return invoke<HistoryEntry[]>("list_history", {
      filter: filter ?? { limit: 200 },
      limit: filter?.limit ?? 200,
    });
  },
  getHistory: (id: string) =>
    invoke<HistoryEntry | null>("get_history", { id }),
  recordHistory: (request: RecordHistoryRequest) =>
    invoke<HistoryEntry>("record_history", { request }),
  deleteHistory: (id: string) => invoke<void>("delete_history", { id }),
  clearHistory: () => invoke<void>("clear_history"),
  appDataDir: () => invoke<string>("app_data_dir"),
  openDemoSqlite: () =>
    invoke<[ConnectionInfo, QueryPage]>("open_demo_sqlite"),
};

export function onEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => {});
  }
  return listen<T>(event, (e) => handler(e.payload));
}

export type { PendingConfirmation };
