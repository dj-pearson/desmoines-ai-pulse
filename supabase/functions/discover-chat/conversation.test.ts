// Run with: deno test supabase/functions/discover-chat/conversation.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { clampConversation, MAX_MESSAGE_CHARS, MAX_MESSAGES } from './conversation.ts';

const turn = (i: number) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` });

Deno.test('a short conversation passes through unchanged', () => {
  const msgs = [turn(0), turn(1), turn(2)];
  assertEquals(clampConversation(msgs), msgs);
});

Deno.test('only the last 20 turns reach the model, starting on a user turn', () => {
  const msgs = Array.from({ length: 51 }, (_, i) => turn(i));
  const out = clampConversation(msgs);
  assertEquals(out.length <= MAX_MESSAGES, true);
  assertEquals(out[0].role, 'user');
  assertEquals(out[out.length - 1].content, 'm50');
});

Deno.test('a slice that would open on an assistant turn drops it', () => {
  // 21 turns starting with user: the last 20 open on an assistant turn.
  const msgs = Array.from({ length: 21 }, (_, i) => turn(i));
  const out = clampConversation(msgs);
  assertEquals(out[0].role, 'user');
  assertEquals(out.length, MAX_MESSAGES - 1);
});

Deno.test('each message is cut to 2000 characters', () => {
  const out = clampConversation([{ role: 'user', content: 'x'.repeat(50_000) }]);
  assertEquals(out[0].content.length, MAX_MESSAGE_CHARS);
});

Deno.test('a conversation with no user turn is passed through for the caller to handle', () => {
  const msgs = [{ role: 'assistant', content: 'hi' }];
  assertEquals(clampConversation(msgs), msgs);
});
