#!/usr/bin/env node
/**
 * The nine dead-column writes WEB-QUAL-015 found, pinned against the generated
 * types so they cannot come back.
 *
 *   npx tsx scripts/__tests__/dead-column-writes.test.mjs
 *
 * WHY A TEST AND NOT check-schema-usage.mjs. That checker reads `.select()`
 * literals and `.from()`/`.rpc()` names; it does NOT read the object literal
 * passed to `.insert()` or `.update()`. Every defect below sat in that gap -
 * a write naming a column the table does not have, which PostgREST rejects
 * with PGRST204 and which fails the WHOLE statement, so the real columns
 * alongside it are discarded too. None of them appear in schema-baseline.json.
 *
 * @supabase/supabase-js 2.85+ now catches this class at compile time, and the
 * app ratchet runs on every PR, so the bump is the general guard. This file is
 * the specific one: it asserts the columns are still absent from the types, so
 * a future edit that re-adds a write gets a named failure rather than a silent
 * PGRST204.
 */
import { readFileSync } from 'node:fs';

const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

/** The Row block for one table in the generated types. */
function rowBlock(table) {
  const start = types.indexOf(`\n      ${table}: {\n        Row: {\n`);
  if (start < 0) return null;
  const from = types.indexOf('Row: {', start);
  const to = types.indexOf('\n        Insert: {', from);
  return to < 0 ? null : types.slice(from, to);
}

const hasColumn = (table, column) => {
  const block = rowBlock(table);
  if (block === null) return null;
  return new RegExp(`^\\s+${column}\\??:`, 'm').test(block);
};

console.log('[dead-column-writes] columns that must stay absent');

// Every table named here must still exist, or the assertions below are vacuous.
for (const table of ['event_checkins', 'articles', 'user_journeys', 'restaurant_openings', 'playgrounds', 'crm_activities']) {
  check(`${table} is in the generated types`, rowBlock(table) !== null);
}

// 1. event_checkins was DROPped and recreated with a different shape by
//    migration 20251110000010; useEventSocial kept writing the old one, so
//    every check-in came back PGRST204.
check('event_checkins has no check_in_method', hasColumn('event_checkins', 'check_in_method') === false);
check('event_checkins has no location_verified', hasColumn('event_checkins', 'location_verified') === false);
check('event_checkins still has is_verified', hasColumn('event_checkins', 'is_verified') === true);

// 2. articles.review_status never existed. Three sites wrote it, and the one
//    in ContentQueue carried status + published_at with it - so publishing
//    from the content queue failed entirely.
check('articles has no review_status', hasColumn('articles', 'review_status') === false);
check('articles still has status', hasColumn('articles', 'status') === true);
check('articles still has published_at', hasColumn('articles', 'published_at') === true);

// 3. user_journeys.entry_page and entry_point are NOT NULL and were not being
//    sent. useAnalytics is the only writer, so the table has never held a row.
for (const col of ['entry_page', 'entry_point']) {
  check(`user_journeys.${col} exists`, hasColumn('user_journeys', col) === true);
  const row = rowBlock('user_journeys');
  check(`user_journeys.${col} is still NOT NULL`, new RegExp(`^\\s+${col}: string$`, 'm').test(row));
}

// 4. restaurant_openings carries opening_timeframe; `openingTimeframe` is a
//    camelCase READ alias from useSupabase.ts and must never reach a write.
check('restaurant_openings has opening_timeframe', hasColumn('restaurant_openings', 'opening_timeframe') === true);
check('restaurant_openings has no openingTimeframe', hasColumn('restaurant_openings', 'openingTimeframe') === false);

// 5. AffiliateManager claimed source_url and website on playgrounds, which has
//    neither, and website on restaurant_openings, which does not have it.
check('playgrounds has no source_url', hasColumn('playgrounds', 'source_url') === false);
check('playgrounds has no website', hasColumn('playgrounds', 'website') === false);
check('restaurant_openings has no website', hasColumn('restaurant_openings', 'website') === false);
check('restaurant_openings has source_url', hasColumn('restaurant_openings', 'source_url') === true);

// 6. The source files must not name them again.
const sources = {
  'src/hooks/useEventSocial.ts': ['check_in_method', 'location_verified'],
  'src/components/cms/ContentQueue.tsx': ['review_status'],
  'src/components/cms/EnhancedArticleEditor.tsx': ['review_status'],
  'src/components/AffiliateManager.tsx': ["'playgrounds'"],
};
for (const [file, banned] of Object.entries(sources)) {
  const body = readFileSync(file, 'utf8');
  // Strip comments: these files EXPLAIN the dead columns, and a check that
  // fires on its own explanation is the trap this repo keeps re-finding.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const token of banned) {
    check(`${file} does not name ${token}`, !code.includes(token));
  }
}

if (failures > 0) {
  console.error(`[dead-column-writes] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[dead-column-writes] all checks passed');
