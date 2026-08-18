/**
 * Erasure coverage of user-keyed tables (WEB-LEGAL-004).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/user-data-tables.test.ts
 *
 * WHAT WENT WRONG
 * delete-user-account named eight tables inline. Three of them - favorites,
 * ratings, reviews - do not exist in this database, so those deletes returned
 * 42P01. The loop downgrades any failure to console.warn, and vite strips
 * console.* from production builds, so the erasure reported success while
 * silently doing less than it claimed. The real reviews table, user_ratings,
 * was not in the list at all, so reviews and their photo_urls survived account
 * deletion entirely.
 *
 * The static schema checker could not catch it: scripts/check-schema-usage.mjs
 * does scan supabase/functions, but it matches .from('literal'), and these
 * names reached .from(table) as a loop variable.
 *
 * These tests close both holes. The last one is the important one: it fails
 * when a NEW table with a user_id column appears in the schema and nobody has
 * decided whether erasure should cover it. That decision is easy to forget and
 * invisible when forgotten.
 */

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { PURGE_TABLES, RETAINED_TABLES } from '../_shared/userDataTables.ts';

const typesSource = await Deno.readTextFile(
  new URL('../../../src/integrations/supabase/types.ts', import.meta.url),
);

/** table name -> column names, parsed from the generated Row types. */
function parseSchema(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const table = /\n {6}(\w+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}\n/g;
  for (const m of src.matchAll(table)) {
    const cols = [...m[2].matchAll(/\n {10}(\w+)\??:/g)].map((c) => c[1]);
    out.set(m[1], cols);
  }
  return out;
}

const schema = parseSchema(typesSource);
const withUserId = [...schema.entries()]
  .filter(([, cols]) => cols.includes('user_id'))
  .map(([name]) => name);

Deno.test('the parser actually found the schema', () => {
  assert(schema.size > 200, `expected a few hundred tables, parsed ${schema.size}`);
  assert(withUserId.length > 50, `expected many user_id tables, found ${withUserId.length}`);
});

Deno.test('every table queued for deletion exists in the schema', () => {
  const missing = PURGE_TABLES.filter((t) => !schema.has(t));
  assertEquals(
    missing,
    [],
    `these would return 42P01 and be swallowed as a warning: ${missing.join(', ')}`,
  );
});

Deno.test('every retained table exists in the schema', () => {
  const missing = Object.keys(RETAINED_TABLES).filter((t) => !schema.has(t));
  assertEquals(missing, [], `retained but non-existent: ${missing.join(', ')}`);
});

Deno.test('the tables that regressed erasure are handled correctly', () => {
  // The three phantoms must not come back.
  for (const phantom of ['favorites', 'ratings', 'reviews']) {
    assert(!schema.has(phantom), `${phantom} now exists; revisit this classification`);
    assert(
      !PURGE_TABLES.includes(phantom),
      `${phantom} does not exist in this database and must not be queried`,
    );
  }
  // The real reviews table must be covered; it carries photo_urls.
  assert(PURGE_TABLES.includes('user_ratings'), 'user_ratings holds the reviews and their photos');
  assert(schema.get('user_ratings')?.includes('photo_urls'), 'expected photo_urls on user_ratings');
});

Deno.test('a table is never both purged and retained', () => {
  const both = PURGE_TABLES.filter((t) => t in RETAINED_TABLES);
  assertEquals(both, [], `contradictory classification: ${both.join(', ')}`);
});

Deno.test('every retained table carries a stated reason', () => {
  const unexplained = Object.entries(RETAINED_TABLES)
    .filter(([, reason]) => !reason || reason.trim().length < 20)
    .map(([t]) => t);
  assertEquals(unexplained, [], `retention needs a basis, not a shrug: ${unexplained.join(', ')}`);
});

Deno.test('profiles is deleted last so foreign keys do not block it', () => {
  assertEquals(PURGE_TABLES[PURGE_TABLES.length - 1], 'profiles');
});

Deno.test('no table with a user_id column is left unclassified', () => {
  const classified = new Set([...PURGE_TABLES, ...Object.keys(RETAINED_TABLES)]);
  const unclassified = withUserId.filter((t) => !classified.has(t));
  assertEquals(
    unclassified,
    [],
    'A table keyed by user_id is neither purged nor retained. Decide which it is ' +
      'in _shared/userDataTables.ts - do not leave it out by default, because the ' +
      `default is that the user's data survives erasure: ${unclassified.join(', ')}`,
  );
});
