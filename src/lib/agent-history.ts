import type { ChatMessage } from "@/lib/types";

const MAX_TURNS = 40;
const MAX_CONTENT = 8_000;

export function looksLikeToolCallDump(content: string): boolean {
  const t = content.trim();
  if (!t.startsWith("{")) return false;
  try {
    const obj = JSON.parse(t) as { name?: string; arguments?: unknown };
    return typeof obj.name === "string" && "arguments" in obj;
  } catch {
    return /^\{\s*"name"\s*:/.test(t) && t.includes('"arguments"');
  }
}

/** Prior UI turns to seed a new Rust session after restart / dead sessionId. */
export function historyForAgentResume(
  messages: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.id === "welcome") continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = m.content.trim();
    if (!content) continue;
    if (m.role === "assistant" && looksLikeToolCallDump(content)) continue;
    out.push({
      role: m.role,
      content:
        content.length > MAX_CONTENT
          ? `${content.slice(0, MAX_CONTENT)}…`
          : content,
    });
  }
  return out.slice(-MAX_TURNS);
}

export function hasAssistantTranscript(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.id !== "welcome" &&
      (m.role === "user" || m.role === "assistant") &&
      m.content.trim().length > 0,
  );
}
