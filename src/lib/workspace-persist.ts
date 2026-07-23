import type { ChatMessage } from "@/lib/types";
import { useWorkspace } from "@/stores/workspace";

const STORAGE_KEY = "prompton.workspace.v1";
const MAX_MESSAGES = 80;
const MAX_CONTENT = 12_000;

export type ConnDraft = {
  sql: string;
  messages: ChatMessage[];
  sessionId: string | null;
};

export type WorkspaceSnapshot = {
  version: 1;
  activeConnId: string | null;
  artifactKind: string;
  artifactOpen: boolean;
  drafts: Record<string, ConnDraft>;
  /** SQL when no connection is selected. */
  orphanSql: string;
};

const DEFAULT_SQL = "SELECT 1;";

function defaultWelcome(content: string): ChatMessage {
  return { id: "welcome", role: "assistant", content };
}

export function defaultConnectionMessages(): ChatMessage[] {
  return [
    defaultWelcome(
      "Connection context restored. Ask a question or run SQL.",
    ),
  ];
}

function defaultSnapshot(): WorkspaceSnapshot {
  return {
    version: 1,
    activeConnId: null,
    artifactKind: "results",
    artifactOpen: true,
    drafts: {},
    orphanSql: DEFAULT_SQL,
  };
}

export function loadWorkspaceSnapshot(): WorkspaceSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSnapshot();
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    if (parsed.version !== 1 || typeof parsed !== "object") {
      return defaultSnapshot();
    }
    return {
      ...defaultSnapshot(),
      ...parsed,
      drafts: parsed.drafts ?? {},
      orphanSql:
        typeof parsed.orphanSql === "string" ? parsed.orphanSql : DEFAULT_SQL,
      artifactKind: parsed.artifactKind ?? "results",
      artifactOpen: parsed.artifactOpen !== false,
      activeConnId:
        typeof parsed.activeConnId === "string" ? parsed.activeConnId : null,
    };
  } catch {
    return defaultSnapshot();
  }
}

export function saveWorkspaceSnapshot(
  patch: Partial<WorkspaceSnapshot>,
): WorkspaceSnapshot {
  const next: WorkspaceSnapshot = {
    ...loadWorkspaceSnapshot(),
    ...patch,
    version: 1,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

/** Trim/normalize messages so drafts stay small and resume-safe. */
export function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const trimmed = messages.slice(-MAX_MESSAGES).map((m) => {
    let toolState = m.toolState;
    if (
      toolState === "input-streaming" ||
      toolState === "input-available" ||
      toolState === "approval-requested"
    ) {
      toolState = "output-error";
    }
    const content =
      m.content.length > MAX_CONTENT
        ? `${m.content.slice(0, MAX_CONTENT)}\n…`
        : m.content;
    return { ...m, content, toolState };
  });
  if (trimmed.length === 0) return defaultConnectionMessages();
  return trimmed;
}

export function captureDraftFromWorkspace(): ConnDraft {
  const s = useWorkspace.getState();
  return {
    sql: s.sql,
    messages: sanitizeMessages(s.messages),
    sessionId: s.sessionId,
  };
}

/** Persist the active connection’s draft (or orphan SQL). */
export function persistActiveDraft(): void {
  const s = useWorkspace.getState();
  const draft = captureDraftFromWorkspace();
  if (s.activeConnId) {
    const snap = loadWorkspaceSnapshot();
    saveWorkspaceSnapshot({
      activeConnId: s.activeConnId,
      drafts: { ...snap.drafts, [s.activeConnId]: draft },
    });
  } else {
    saveWorkspaceSnapshot({
      activeConnId: null,
      orphanSql: draft.sql,
    });
  }
}

export function readConnDraft(connId: string): ConnDraft | null {
  return loadWorkspaceSnapshot().drafts[connId] ?? null;
}

export function deleteConnDraft(connId: string): void {
  const snap = loadWorkspaceSnapshot();
  if (!(connId in snap.drafts)) return;
  const drafts = { ...snap.drafts };
  delete drafts[connId];
  saveWorkspaceSnapshot({
    drafts,
    activeConnId: snap.activeConnId === connId ? null : snap.activeConnId,
  });
}

export function persistArtifactPrefs(kind: string, open: boolean): void {
  saveWorkspaceSnapshot({ artifactKind: kind, artifactOpen: open });
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced draft save for sql/chat edits. */
export function schedulePersistActiveDraft(delayMs = 400): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistActiveDraft();
  }, delayMs);
}

export function flushPersistActiveDraft(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistActiveDraft();
}
