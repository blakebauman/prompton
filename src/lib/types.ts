export type Dialect = "postgres" | "sqlite";

export type ProviderKind = "openaiCompatible" | "anthropic" | "ollama";

export interface ConnectionInfo {
  id: string;
  name: string;
  dialect: Dialect;
  color: string;
  connected: boolean;
  summary: string;
  isProduction?: boolean;
  /** Admin override: unlock writes on a production connection. */
  adminWritesUnlocked?: boolean;
}

export interface ConnectRequest {
  name: string;
  dialect: Dialect;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  filePath?: string;
  color?: string;
  sslMode?: string;
  /** Postgres defaults to true; SQLite defaults to false when omitted. */
  isProduction?: boolean;
}

export interface SchemaNode {
  name: string;
  kind: string;
  children: SchemaNode[];
  dataType?: string;
  nullable?: boolean;
}

export interface QueryColumn {
  name: string;
  dataType: string;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface TableDescription {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  estimatedRows?: number | null;
}

export interface QueryPage {
  queryId: string;
  columns: QueryColumn[];
  rows: unknown[][];
  offset: number;
  limit: number;
  totalRows: number;
  truncated: boolean;
  /** Present when truncated — server row cap that stopped the fetch. */
  rowCap?: number | null;
  affectedRows?: number | null;
  durationMs: number;
  sql: string;
}

export interface RunQueryRequest {
  connId: string;
  sql: string;
  pageSize?: number;
  /** Client-supplied id so Cancel can target an in-flight run. */
  queryId?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolState?:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
    | "approval-requested"
    | "approval-responded"
    | "output-denied";
}

export interface PendingConfirmation {
  confirmationId: string;
  sessionId?: string;
  connId: string;
  sql: string;
  reason: string;
  isProduction: boolean;
  adminWritesUnlocked?: boolean;
  toolCallId?: string;
}

export interface AgentSettings {
  provider: {
    kind: ProviderKind;
    model: string;
    baseUrl?: string | null;
  };
}

export interface BudgetReport {
  slices: { label: string; content: string; chars: number }[];
  totalChars: number;
  truncated: boolean;
}

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

export interface PromptEntry {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export type HistoryKind = "query" | "agent";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  title: string;
  body: string;
  detail?: string | null;
  connId?: string | null;
  connName?: string | null;
  status: string;
  meta?: {
    totalRows?: number;
    durationMs?: number;
    sessionId?: string;
  } | null;
  createdAt: string;
}

export interface RecordHistoryRequest {
  kind: HistoryKind;
  title: string;
  body: string;
  detail?: string | null;
  connId?: string | null;
  connName?: string | null;
  status?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface HistoryListFilter {
  limit?: number;
  kind?: HistoryKind | null;
  connId?: string | null;
  status?: string | null;
  query?: string | null;
}
