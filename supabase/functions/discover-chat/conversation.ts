/**
 * Input caps for discover-chat (WP1 of docs/plans/NON_CORE_REVIEW_2026-09.md).
 * No imports, so conversation.test.ts runs offline.
 *
 * Clamped, not rejected: a new 400 would tighten validation for shipped
 * clients. Before this the whole history went to the model on every step of a
 * six-step tool loop, at whatever length the caller sent.
 */

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2000;

export interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Keep the last MAX_MESSAGES turns, each cut to MAX_MESSAGE_CHARS, and start
 * on a user turn so the slice never opens with an orphaned assistant reply.
 */
export function clampConversation(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content.length > MAX_MESSAGE_CHARS ? m.content.slice(0, MAX_MESSAGE_CHARS) : m.content,
  }));
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser <= 0 ? recent : recent.slice(firstUser);
}
