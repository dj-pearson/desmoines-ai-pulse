/**
 * The map's nearby RPCs return only live rows and clamp what anon can ask for
 * (IOS-DD-MAP-01/02/03).
 *
 * search_events_near_location is SECURITY DEFINER, so RLS never filtered it:
 * its WHERE clause is the only thing keeping merged, hidden and archived
 * events off the map. It also ranked is_featured first with no label. The
 * restaurant and attraction RPCs ignored merge, closure and is_active, and all
 * three took any radius and limit. This reads the NEWEST migration that
 * defines each function, so a later rewrite is held to the same rules.
 */

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

// Local rather than std's assertMatch: the repo's edge type-check resolves
// std/assert through a stub that exports assert but not assertMatch.
function assertMatch(actual: string, expected: RegExp, msg?: string): void {
  assert(expected.test(actual), msg ?? `expected ${String(expected)} to match`);
}

const REPO = new URL('../../../', import.meta.url);
const MIGRATIONS = new URL('supabase/migrations/', REPO);

/** The newest definition of `fn`, comments stripped, cut to that function. */
async function newestDefinition(fn: string): Promise<{ name: string; text: string }> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS)) {
    if (entry.isFile && entry.name.endsWith('.sql')) names.push(entry.name);
  }
  names.sort();
  const head = new RegExp(`CREATE (OR REPLACE )?FUNCTION (public\\.)?${fn}\\(`);
  for (const name of names.reverse()) {
    const raw = await Deno.readTextFile(new URL(name, MIGRATIONS));
    const code = raw.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');
    const match = head.exec(code);
    if (!match) continue;
    // From the CREATE to the end of its $$ body.
    const start = match.index;
    const bodyOpen = code.indexOf('$$', start);
    const bodyClose = code.indexOf('$$', bodyOpen + 2);
    return { name, text: code.slice(start, bodyClose + 2) };
  }
  throw new Error(`no migration defines ${fn}`);
}

Deno.test('nearby events apply the visibility predicates and do not rank by is_featured', async () => {
  const { name, text } = await newestDefinition('search_events_near_location');
  assertMatch(text, /e\.is_merged IS NOT TRUE/, name);
  assertMatch(text, /e\.is_hidden IS NOT TRUE/, name);
  assertMatch(text, /e\.archived_at IS NULL/, name);
  assert(!/is_featured\s+DESC/i.test(text), `${name} still orders by is_featured`);
});

Deno.test('nearby events clamp radius and limit, and keep running events', async () => {
  const { text } = await newestDefinition('search_events_near_location');
  assertMatch(text, /LEAST\(GREATEST\(COALESCE\(search_limit, 50\), 1\), 200\)/);
  assertMatch(text, /LEAST\(GREATEST\(COALESCE\(radius_meters, 50000\), 0\), 80467\)/);
  assertMatch(text, /e\.end_date >= now\(\)/);
  assertMatch(text, /America\/Chicago/);
  assertMatch(text, /SET search_path = public, extensions, pg_temp/);
  assertMatch(text, /p_until TIMESTAMPTZ DEFAULT NULL/);
});

Deno.test('the four-argument overload is dropped so named calls are not ambiguous', async () => {
  const raw = await Deno.readTextFile(
    new URL('20261013000001_map_nearby_rpcs_visibility_and_clamps.sql', MIGRATIONS),
  );
  assertMatch(raw, /DROP FUNCTION IF EXISTS public\.search_events_near_location\(REAL, REAL, INTEGER, INTEGER\);/);
  assertMatch(
    raw,
    /GRANT EXECUTE ON FUNCTION public\.search_events_near_location\(REAL, REAL, INTEGER, INTEGER, TIMESTAMPTZ\)\s+TO anon, authenticated/,
  );
});

for (const fn of ['restaurants_within_radius', 'restaurants_within_radius_v2']) {
  Deno.test(`${fn} drops merged and permanently closed restaurants and clamps`, async () => {
    const { name, text } = await newestDefinition(fn);
    assertMatch(text, /r\.is_merged IS NOT TRUE/, name);
    assertMatch(text, /CLOSED_PERMANENTLY/, name);
    assertMatch(text, /'closed', 'permanently_closed', 'closed_permanently'/, name);
    assertMatch(text, /LEAST\(GREATEST\(COALESCE\(limit_count, 100\), 1\), 200\)/, name);
    assertMatch(text, /LEAST\(GREATEST\(COALESCE\(radius_miles, 25\), 0\), 50\)/, name);
  });
}

Deno.test('attractions_within_radius honours is_active and clamps', async () => {
  const { name, text } = await newestDefinition('attractions_within_radius');
  assertMatch(text, /a\.is_active IS NOT FALSE/, name);
  assertMatch(text, /LEAST\(GREATEST\(COALESCE\(radius_miles, 30\), 0\), 50\)/, name);
  assertMatch(text, /LEAST\(GREATEST\(COALESCE\(limit_count, 50\), 1\), 200\)/, name);
  assert(!/LIMIT limit_count/.test(text), `${name} still limits by the raw parameter`);
});
