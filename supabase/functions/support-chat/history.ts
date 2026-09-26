/**
 * Input caps for support-chat. The endpoint is anon-callable, so without them
 * one request could carry ~200k input tokens. A support question fits well
 * inside these.
 */
export interface Msg { role: "user" | "assistant"; content: string; }

export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_HISTORY_CHARS = 12_000;
export const MAX_HISTORY_MESSAGES = 12;

/**
 * Keep the newest valid messages, each truncated to MAX_MESSAGE_CHARS, until
 * MAX_HISTORY_CHARS is spent. Leading assistant turns are dropped because the
 * Messages API requires the conversation to open with a user turn.
 */
export function capHistory(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  const valid: Msg[] = raw
    .filter((m): m is Msg =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  const out: Msg[] = [];
  let total = 0;
  for (let i = valid.length - 1; i >= 0; i--) {
    total += valid[i].content.length;
    if (total > MAX_HISTORY_CHARS) break;
    out.unshift(valid[i]);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
