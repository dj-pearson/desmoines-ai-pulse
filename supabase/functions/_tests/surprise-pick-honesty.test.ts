/**
 * get_surprise_pick deals only live rows and no unlabelled featured slot
 * (IOS-DD-DISCOVER-18).
 *
 * The function is SECURITY DEFINER, so RLS never filtered it: the only thing
 * standing between a merged, hidden, archived or closed row and the Surprise
 * Me reveal is its own WHERE clause. It also ranked is_featured (editorial or
 * paid) first with no label. This reads the NEWEST migration that defines the
 * function, so a later rewrite is held to the same rules.
 */

import { assert, assertMatch } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const MIGRATIONS = new URL('supabase/migrations/', REPO);

async function newestDefinition(): Promise<{ name: string; text: string }> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS)) {
    if (entry.isFile && entry.name.endsWith('.sql')) names.push(entry.name);
  }
  names.sort();
  for (const name of names.reverse()) {
    const text = await Deno.readTextFile(new URL(name, MIGRATIONS));
    if (/CREATE (OR REPLACE )?FUNCTION public\.get_surprise_pick\(/.test(text)) {
      // Comments stripped, so prose about is_featured does not count.
      const code = text.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');
      return { name, text: code };
    }
  }
  throw new Error('no migration defines get_surprise_pick');
}

Deno.test('the pick never ranks or admits rows by is_featured', async () => {
  const { name, text } = await newestDefinition();
  assert(!/is_featured/.test(text), `${name} still reads is_featured`);
});

Deno.test('every events read applies the visibility predicates', async () => {
  const { text } = await newestDefinition();
  const fromEvents = (text.match(/FROM events e/g) ?? []).length;
  const joinEvents = (text.match(/JOIN events e/g) ?? []).length;
  const reads = fromEvents + joinEvents;
  assert(reads >= 3, `expected the peek, main and fallback reads, found ${reads}`);
  for (const predicate of [/e\.is_merged IS NOT TRUE/g, /e\.is_hidden IS NOT TRUE/g, /e\.archived_at IS NULL/g]) {
    const count = (text.match(predicate) ?? []).length;
    assert(count >= reads, `${predicate} appears ${count} times for ${reads} events reads`);
  }
});

Deno.test('closed and merged restaurants are excluded', async () => {
  const { text } = await newestDefinition();
  assertMatch(text, /r\.is_merged IS NOT TRUE/);
  assertMatch(text, /CLOSED_PERMANENTLY/);
  assertMatch(text, /CLOSED_TEMPORARILY/);
});

Deno.test('the exclusion parameter is optional and the old overload is dropped', async () => {
  const { text } = await newestDefinition();
  assertMatch(text, /p_exclude_ids UUID\[\] DEFAULT NULL/);
  assertMatch(text, /DROP FUNCTION IF EXISTS public\.get_surprise_pick\(REAL, REAL\)/);
  assertMatch(text, /GRANT EXECUTE ON FUNCTION public\.get_surprise_pick\(REAL, REAL, UUID\[\]\) TO anon, authenticated/);
});

Deno.test('events has no description column; the pick reads the real pair', async () => {
  const { text } = await newestDefinition();
  assert(!/\be\.description\b/.test(text), 'events.description does not exist');
  assertMatch(text, /COALESCE\(e\.enhanced_description, e\.original_description\)/);
});
