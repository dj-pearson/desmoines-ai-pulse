/**
 * Mobile table references against the real schema (XPLAT-013).
 *
 * scripts/check-schema-usage.mjs compares code to the generated Supabase types,
 * and it scans `src/` and `supabase/functions/`. The two shipped mobile clients
 * are not in that list, and Swift and Kotlin have no generated types to compare
 * against, so nothing has ever checked what iOS and Android query. Eighteen call
 * sites across four tables that do not exist had accumulated by the time anyone
 * looked:
 *
 *     trip_plans                    10 sites  iOS TripPlannerService and others
 *     trip_plan_items                2 sites  same
 *     user_attraction_interactions   3 sites  iOS FavoritesService
 *     user_article_interactions      3 sites  iOS FavoritesService
 *
 * THE TWO GROUPS FAIL FOR DIFFERENT REASONS AND THAT MATTERS. trip_plans and
 * trip_plan_items come from 20251126000001_add_ai_trip_planner_nlp_search, which
 * is ledgered as applied and produced nothing (WEB-QA-017) - the SQL exists and
 * replays clean. The two interaction tables are defined in NO migration at all:
 * iOS extrapolated the naming pattern of user_event_interactions and
 * user_restaurant_interactions, which do exist, while web solved the same problem
 * with a single generic content_favorites table (useContentFavorites.ts:10-11,
 * WEB-UX-010).
 *
 * WHAT THAT COSTS IS SYNC, NOT DATA, and this line is a correction: it first read
 * "attraction and article favourites silently fail on iOS", which is wrong.
 * FavoritesService has a deliberate UserDefaults fallback on every path - :347
 * documents it as "Table may not exist yet - fall back to local storage", and
 * :370, :404, :423, :483 and :503 implement it. So the favourite persists on the
 * handset that made it and nowhere else. Read the file, not the table list.
 * XPLAT-013 owns that decision.
 *
 * WHY THIS CHECK IS SAFE TO GATE, unlike some others in this repo: it compares
 * source text to a committed snapshot. No live data, no capture timing, no
 * network. The same commit gives the same answer every run.
 *
 * OFFLINE. Reads scripts/db-snapshot.json, whose refresh command is in the header
 * of scripts/check-migration-drift.mjs.
 *
 * A NEW missing-table reference fails. The four known ones are baselined in
 * .github/mobile-schema-baseline.json because each needs its own decision - the
 * trip-planner pair on WEB-QA-018's re-apply call, the interaction pair on
 * whether iOS should adopt content_favorites or two tables should be created.
 *
 *   node scripts/check-mobile-schema-usage.mjs           # check
 *   node scripts/check-mobile-schema-usage.mjs --write   # re-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'scripts', 'db-snapshot.json');
const BASELINE = join(ROOT, '.github', 'mobile-schema-baseline.json');
const ROOTS = ['ios', 'android/app/src/main'];
const SOURCE = /\.(swift|kt)$/;
/** Build output and vendored deps carry generated copies of the same calls. */
const SKIP_DIR = /^(build|Pods|\.git|\.gradle|node_modules|DerivedData)$/;

if (!existsSync(SNAPSHOT)) {
  console.error(`[mobile-schema] ${SNAPSHOT} is missing. See check-migration-drift.mjs for the refresh command.`);
  process.exit(1);
}
const relations = new Set(JSON.parse(readFileSync(SNAPSHOT, 'utf8')).relations ?? []);
if (relations.size === 0) {
  console.error('[mobile-schema] snapshot lists no relations - refusing to pass.');
  process.exit(1);
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.test(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (SOURCE.test(entry)) out.push(path);
  }
  return out;
}

const files = ROOTS.flatMap((r) => (existsSync(join(ROOT, r)) ? sourceFiles(join(ROOT, r)) : []));
if (files.length === 0) {
  console.error('[mobile-schema] no Swift or Kotlin sources found - refusing to pass.');
  process.exit(1);
}

// Both clients call `.from("table")`. supabase-swift and supabase-kt share the
// spelling, so one pattern covers both. A table name built from a constant is
// invisible here, which is the same blind spot check-ballot-reads.sh documents.
const FROM = /\.from\(\s*"([a-z_][a-z0-9_]*)"/g;
const referenced = new Map();
for (const file of files) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  for (const m of readFileSync(file, 'utf8').matchAll(new RegExp(FROM.source, 'g'))) {
    if (!referenced.has(m[1])) referenced.set(m[1], []);
    referenced.get(m[1]).push(rel);
  }
}

const missing = [...referenced.entries()].filter(([t]) => !relations.has(t));

if (process.argv.includes('--write')) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'XPLAT-013. Tables the mobile clients query that do not exist in production. Each needs its own decision - do not add to this list to make CI pass.',
        tables: missing.map(([t]) => t).sort(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[mobile-schema] wrote ${missing.length} baselined table(s).`);
  process.exit(0);
}

const known = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).tables : []);
const fresh = missing.filter(([t]) => !known.has(t));

console.log(
  `[mobile-schema] ${files.length} mobile source file(s), ${referenced.size} distinct table(s) referenced, ` +
    `${missing.length} absent from production (${known.size} baselined).`
);

for (const [table, sites] of missing.sort((a, b) => b[1].length - a[1].length)) {
  const mark = known.has(table) ? 'known' : 'NEW  ';
  console.log(`  ${mark}  ${table}  (${sites.length} site(s))  e.g. ${sites[0]}`);
}

if (fresh.length > 0) {
  console.error(
    `\nX ${fresh.length} table(s) queried by a mobile client do not exist. Swift and Kotlin have no\n` +
      '  generated types, so this compiles, ships, and returns an empty result at runtime -\n' +
      '  indistinguishable from "you have no favourites". See XPLAT-013.\n'
  );
  process.exit(1);
}

console.log('\nOK No new mobile reference to a table that does not exist.');
process.exit(0);
