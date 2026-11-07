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

export interface TranscriptRow {
  ticket_id: string;
  sender: "user" | "agent";
  body: string;
  metadata: { transcript: true; generated?: true };
}

/**
 * The support_messages rows for a ticket's transcript.
 *
 * Only the user's turns come from the request. The client sends the whole
 * conversation, assistant turns included, and those used to be stored as
 * sender "agent", which SupportConsole shows as something our side said. A
 * caller could write any text into that line. support_sender is an enum
 * (user, agent, admin, system) with no value for "the client says the bot
 * said this", and "system" would make the same false claim, so client-supplied
 * assistant turns are not stored at all.
 *
 * `serverReply` is a reply this request generated itself; that one is ours,
 * so it is stored as "agent" and marked generated.
 */
export function transcriptRows(ticketId: string, history: Msg[], serverReply?: string | null): TranscriptRow[] {
  const rows: TranscriptRow[] = history
    .filter((m) => m.role === "user")
    .map((m) => ({ ticket_id: ticketId, sender: "user", body: m.content, metadata: { transcript: true } }));
  if (serverReply) {
    rows.push({ ticket_id: ticketId, sender: "agent", body: serverReply, metadata: { transcript: true, generated: true } });
  }
  return rows;
}
