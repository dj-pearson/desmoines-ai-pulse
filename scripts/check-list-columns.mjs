#!/usr/bin/env node
/**
 * Every column in a LIST projection must exist on its table (WEB-PERF-035).
 *
 * WHY THIS IS ABSOLUTE AND NOT A RATCHET. PostgREST rejects the WHOLE select
 * with 42703 for ONE unknown column name. There is no partial result: the hook
 * throws, the page renders its empty state, and the surface goes blank. That is
 * not hypothetical - src/lib/listColumns.ts carries a comment about
 * `archived_at`, which lives on archived_events and never on events, and took
 * out the homepage (WEB-QA-003).
 *
 * It is also not hypothetical for whoever writes the next projection. The first
 * draft of PLAYGROUND_LIST_COLUMNS in this story named seven columns the table
 * does not have - address, city, has_water, hours, is_accessible, is_fenced,
 * parking - written from what a playground plausibly has rather than from the
 * schema. This check is what caught them.
 *
 * SOURCE OF TRUTH is src/integrations/supabase/types.ts. CLAUDE.md is right
 * that the generated types can be stale and that absence there is not proof a
 * column is missing - but the risk here is asymmetric. Naming a column that
 * does not exist breaks the whole query; omitting one that does costs a field.
 * So this fails only on names the types do not know, which is the direction
 * that breaks pages.
 *
 * Usage: node scripts/check-list-columns.mjs
 */
import { readFileSync } from 'node:fs';

const COLUMNS_FILE = 'src/lib/listColumns.ts';
const TYPES_FILE = 'src/integrations/supabase/types.ts';

/** Projection constant -> the table it is selected from. */
const TABLE_FOR = {
  RESTAURANT_LIST_COLUMNS: 'restaurants',
  EVENT_LIST_COLUMNS: 'events',
  ATTRACTION_LIST_COLUMNS: 'attractions',
  HOTEL_LIST_COLUMNS: 'hotels',
  PLAYGROUND_LIST_COLUMNS: 'playgrounds',
  EVENT_SLUG_COLUMNS: 'events',
};

const src = readFileSync(COLUMNS_FILE, 'utf8');
const types = readFileSync(TYPES_FILE, 'utf8');

/** The Row shape's column names for one table in the generated types. */
function columnsOf(table) {
  const at = types.indexOf(`      ${table}: {`);
  if (at < 0) return null;
  const segment = types.slice(at, at + 40000);
  const rowAt = segment.indexOf('Row: {');
  const insertAt = segment.indexOf('Insert: {');
  if (rowAt < 0 || insertAt < rowAt) return null;
  const row = segment.slice(rowAt, insertAt);
  return new Set([...row.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]));
}

const problems = [];
let checked = 0;

// ADMIN_EXTRA_COLUMNS is handled separately below: it is appended to several
// projections rather than selected from one table.
const declarations = [...src.matchAll(/export const (\w+_COLUMNS)\s*=\s*\n?\s*"([^"]+)"/g)].filter(
  ([, name]) => name !== 'ADMIN_EXTRA_COLUMNS',
);
if (declarations.length === 0) {
  console.error(`[list-columns] no *_COLUMNS found in ${COLUMNS_FILE} - has the shape changed?`);
  process.exit(1);
}

for (const [, name, projection] of declarations) {
  const table = TABLE_FOR[name];
  if (!table) {
    problems.push(
      `${name} has no table mapped in this script. Add it to TABLE_FOR, or the projection is unchecked.`,
    );
    continue;
  }
  const have = columnsOf(table);
  if (!have) {
    problems.push(`public.${table} was not found in ${TYPES_FILE}; ${name} cannot be checked.`);
    continue;
  }
  checked += 1;
  const wanted = projection.split(',').map((c) => c.trim()).filter(Boolean);
  const missing = wanted.filter((c) => !have.has(c));
  if (missing.length > 0) {
    problems.push(
      `${name} names ${missing.length} column(s) absent from public.${table}: ${missing.join(', ')}. ` +
        'PostgREST rejects the whole select with 42703, so this blanks the surface rather than dropping a field.',
    );
  }
  const duplicates = wanted.filter((c, i) => wanted.indexOf(c) !== i);
  if (duplicates.length > 0) {
    problems.push(`${name} repeats: ${[...new Set(duplicates)].join(', ')}.`);
  }
}

// The admin-only extras are appended to a projection at runtime, so they have
// to exist on every table that can receive them.
const adminMatch = src.match(/export const ADMIN_EXTRA_COLUMNS\s*=\s*"([^"]+)"/);
if (adminMatch) {
  for (const table of ['events', 'restaurants']) {
    const have = columnsOf(table);
    if (!have) continue;
    for (const col of adminMatch[1].split(',').map((c) => c.trim()).filter(Boolean)) {
      if (!have.has(col)) {
        problems.push(`ADMIN_EXTRA_COLUMNS names "${col}", absent from public.${table}.`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error('\nX A list projection names a column its table does not have:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`[list-columns] ${checked} projection(s) check out against the generated types.`);
