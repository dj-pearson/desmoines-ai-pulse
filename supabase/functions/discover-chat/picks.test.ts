// Run with: deno test supabase/functions/discover-chat/picks.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  eventStillOnOrFilter,
  MAX_PICKS,
  recordSeen,
  sanitizeFollowUps,
  sanitizeText,
  validatePicks,
} from './picks.ts';

function seenWith(ids: string[], itemType = 'event'): Map<string, Record<string, unknown>> {
  const seen = new Map<string, Record<string, unknown>>();
  for (const id of ids) {
    seen.set(`${itemType}:${id}`, { id, title: `Show ${id}`, date: '2026-10-02T00:30:00+00:00', venue: 'Wooly\'s' });
  }
  return seen;
}

const pick = (itemId: string, reason = 'Great live set') => ({ itemType: 'event', itemId, reason });

Deno.test('a pick whose row no tool returned is dropped', () => {
  const out = validatePicks([pick('e1'), pick('invented')], seenWith(['e1']));
  assertEquals(out.map((p) => p.itemId), ['e1']);
});

Deno.test('picks are capped at five and deduplicated', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const out = validatePicks([pick('a'), ...ids.map((id) => pick(id))], seenWith(ids));
  assertEquals(out.length, MAX_PICKS);
  assertEquals(out.map((p) => p.itemId), ['a', 'b', 'c', 'd', 'e']);
});

Deno.test('a pick with an empty reason is dropped', () => {
  const out = validatePicks([pick('e1', '   '), pick('e2', '')], seenWith(['e1', 'e2']));
  assertEquals(out, []);
});

Deno.test('phone numbers and links are stripped from the reason', () => {
  const out = validatePicks(
    [pick('e1', 'Great show, call 515-555-1234 at evil.example https://x.y for tickets')],
    seenWith(['e1']),
  );
  assertEquals(out.length, 1);
  const reason = out[0].reason;
  assert(!reason.includes('515'), reason);
  assert(!reason.includes('https://'), reason);
  assert(!reason.includes('evil.example'), reason);
  assert(reason.startsWith('Great show'), reason);
});

Deno.test('the pick is filled from the row the tool returned', () => {
  const [out] = validatePicks([pick('e1')], seenWith(['e1']));
  assertEquals(out.title, 'Show e1');
  assertEquals(out.startsAt, '2026-10-02T00:30:00+00:00');
  assertEquals(out.venue, "Wooly's");
});

Deno.test('a restaurant pick takes name, cuisine and price_range', () => {
  const seen = new Map<string, Record<string, unknown>>();
  recordSeen(seen, 'restaurant', { results: [{ id: 'r1', name: 'Fong\'s', cuisine: 'Pizza', price_range: '$$' }] });
  const [out] = validatePicks([{ itemType: 'restaurant', itemId: 'r1', reason: 'Crab rangoon pizza' }], seen);
  assertEquals(out.title, "Fong's");
  assertEquals(out.cuisine, 'Pizza');
  assertEquals(out.priceRange, '$$');
});

Deno.test('the same id under another type does not count as seen', () => {
  const out = validatePicks([{ itemType: 'restaurant', itemId: 'e1', reason: 'x' }], seenWith(['e1']));
  assertEquals(out, []);
});

Deno.test('non-array input yields no picks', () => {
  assertEquals(validatePicks(undefined, seenWith(['e1'])), []);
  assertEquals(validatePicks('e1', seenWith(['e1'])), []);
});

Deno.test('follow-ups are capped at three, each at 80 characters', () => {
  const out = sanitizeFollowUps(['one', 'two', 'three', 'four', 'five']);
  assertEquals(out, ['one', 'two', 'three']);
  const [long] = sanitizeFollowUps(['x'.repeat(200)]);
  assertEquals(long.length, 80);
});

Deno.test('sanitizeText removes control and invisible characters', () => {
  assertEquals(sanitizeText('a\u0000b\u200Bc\u202Ed', 20), 'a b c d');
  assertEquals(sanitizeText(42, 20), null);
});

Deno.test('the still-on filter has a started-recently arm and an end_date arm', () => {
  const now = new Date('2026-10-01T23:00:00.000Z');
  const filter = eventStillOnOrFilter(now);
  assert(filter.includes('date.gte.2026-10-01T20:00:00.000Z'), filter);
  assert(filter.includes('end_date.gte.2026-10-01T23:00:00.000Z'), filter);
});
