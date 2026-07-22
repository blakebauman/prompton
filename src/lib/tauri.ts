import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AgentSettings,
  BudgetReport,
  ConnectRequest,
  ConnectionInfo,
  HistoryEntry,
  PendingConfirmation,
  PromptEntry,
  QueryPage,
  RecordHistoryRequest,
  RunQueryRequest,
  SchemaNode,
  SkillMeta,
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

export const api = {
  listConnections: () => invoke<ConnectionInfo[]>("list_connections"),
  connectDb: (request: ConnectRequest) =>
    invoke<ConnectionInfo>("connect_db", { request }),
  reconnectDb: (id: string) => invoke<ConnectionInfo>("reconnect_db", { id }),
  disconnectDb: (id: string) => invoke<void>("disconnect_db", { id }),
  removeConnection: (id: string) => invoke<void>("remove_connection", { id }),
  listSchemas: (id: string) => invoke<SchemaNode[]>("list_schemas", { id }),
  describeTable: (id: string, schema: string, table: string) =>
    invoke("describe_table", { id, schema, table }),
  runQuery: (request: RunQueryRequest) =>
    invoke<QueryPage>("run_query", {
      request,
      allow_mutating: false,
    }),
  requestWriteApproval: (
    connId: string,
    sql: string,
    sessionId?: string | null,
  ) =>
    invoke<PendingConfirmation>("request_write_approval", {
      conn_id: connId,
      sql,
      session_id: sessionId ?? null,
    }),
  confirmWrite: (confirmationId: string, approved: boolean) =>
    invoke<QueryPage | null>("confirm_write", {
      confirmation_id: confirmationId,
      approved,
    }),
  setConnectionProduction: (id: string, isProduction: boolean) =>
    invoke<ConnectionInfo>("set_connection_production", {
      id,
      is_production: isProduction,
    }),
  setAdminWritesUnlocked: (id: string, unlocked: boolean) =>
    invoke<ConnectionInfo>("set_admin_writes_unlocked", {
      id,
      unlocked,
    }),
  cancelQuery: (queryId: string) =>
    invoke<void>("cancel_query", { query_id: queryId }),
  fetchQueryPage: (queryId: string, offset: number, limit: number) =>
    invoke<QueryPage>("fetch_query_page", {
      query_id: queryId,
      offset,
      limit,
    }),
  explainQuery: (connId: string, sql: string) =>
    invoke<string>("explain_query", { conn_id: connId, sql }),
  agentChat: (request: {
    sessionId?: string | null;
    connId: string;
    message: string;
  }) => invoke<string>("agent_chat", { request }),
  agentCancel: (sessionId: string) =>
    invoke<void>("agent_cancel", { session_id: sessionId }),
  agentConfirm: (confirmationId: string, approved: boolean) =>
    invoke<void>("agent_confirm", {
      confirmation_id: confirmationId,
      approved,
    }),
  agentGetSettings: () => invoke<AgentSettings>("agent_get_settings"),
  agentSetSettings: (settings: AgentSettings, apiKey?: string) =>
    invoke<void>("agent_set_settings", {
      settings,
      api_key: apiKey,
    }),
  agentLastContext: (sessionId: string) =>
    invoke<BudgetReport | null>("agent_last_context", {
      session_id: sessionId,
    }),
  listOllamaModels: (baseUrl?: string) =>
    invoke<{ name: string; size?: number; supportsTools: boolean }[]>(
      "list_ollama_models",
      { base_url: baseUrl },
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
  listHistory: (limit?: number) =>
    invoke<HistoryEntry[]>("list_history", { limit }),
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
