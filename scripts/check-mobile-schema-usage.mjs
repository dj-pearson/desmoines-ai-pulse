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
import { parseSelect } from './lib/mobileSelectColumns.mjs';
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
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const relations = new Set(snapshot.relations ?? []);
if (relations.size === 0) {
  console.error('[mobile-schema] snapshot lists no relations - refusing to pass.');
  process.exit(1);
}

// table -> Set(column). The snapshot stores them as "table.column" strings.
const columnsByTable = new Map();
for (const entry of snapshot.columns ?? []) {
  const dot = entry.indexOf('.');
  if (dot === -1) continue;
  const table = entry.slice(0, dot);
  if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
  columnsByTable.get(table).add(entry.slice(dot + 1));
}
if (columnsByTable.size === 0) {
  console.error('[mobile-schema] snapshot lists no columns - refusing to pass on the column check.');
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
  const rel = file.slice(ROOT.length + 1).split('\\').join('/');
  for (const m of readFileSync(file, 'utf8').matchAll(new RegExp(FROM.source, 'g'))) {
    if (!referenced.has(m[1])) referenced.set(m[1], []);
    referenced.get(m[1]).push(rel);
  }
}

const missing = [...referenced.entries()].filter(([t]) => !relations.has(t));

// COLUMNS, not just tables. The table check above catches a whole feature
// pointing at nothing; this catches one bad name inside an otherwise working
// query, which fails the request with 42703 and - because both SDKs surface
// that as a thrown error the caller usually catches - looks like an empty list.
//
// Only EXPLICIT column lists are checkable. `.select("*")` names nothing, so
// the risk there is a Codable/data-class property for a column that does not
// exist. Swift decoding of an OPTIONAL property tolerates a missing key, and
// almost every property on these models is optional, so that surface is small
// and is not asserted here - stating it because "the check passes" should not
// be read as "every mobile model matches the schema".
const COLUMN_SITE = /\.from\(\s*"([a-z_][a-z0-9_]*)"[\s\S]{0,200}?\.select\(\s*"([^"]+)"/g;
const columnFindings = [];
let columnCheckedSites = 0;
for (const file of files) {
  const rel = file.slice(ROOT.length + 1).split('\\').join('/');
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(COLUMN_SITE)) {
    const table = m[1];
    // A table that does not exist is already reported above; its columns cannot
    // be checked and reporting them too would triple one finding.
    if (!columnsByTable.has(table)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    columnCheckedSites++;
    const spec = parseSelect(m[2]);
    for (const col of spec.columns) {
      if (!columnsByTable.get(table).has(col)) columnFindings.push({ rel, line, table, col });
    }
    for (const embed of spec.embeds) {
      // AN EMBED HEAD IS EITHER A TARGET TABLE OR A FOREIGN-KEY COLUMN, and
      // PostgREST accepts both spellings:
      //     plan:subscription_plans(name)         head is a TABLE
      //     profiles:user_id (first_name)         head is the FK COLUMN
      // The second is in RatingsService.swift:29 and the first pass reported it
      // as 'embedded table user_id does not exist'. Resolving which table a FK
      // points at needs the constraint graph, which the snapshot does not carry,
      // so a head that is a real column of the outer table is accepted and its
      // inner columns are left unchecked. Under-checking beats a false failure
      // in a gate that blocks merges.
      if (!columnsByTable.has(embed.table)) {
        const isForeignKeyEmbed = columnsByTable.get(table).has(embed.table);
        if (!isForeignKeyEmbed) {
          columnFindings.push({ rel, line, table: embed.table, col: '(embedded table does not exist)' });
        }
        continue;
      }
      for (const col of embed.columns) {
        if (!columnsByTable.get(embed.table).has(col)) {
          columnFindings.push({ rel, line, table: embed.table, col });
        }
      }
    }
  }
}

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
    `${missing.length} absent from a schema snapshot from ${snapshot.capturedAt} (${known.size} baselined).`
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

if (columnFindings.length > 0) {
  console.error(`\nX ${columnFindings.length} mobile select(s) name a column that does not exist:`);
  for (const f of columnFindings) console.error(`  ${f.rel}:${f.line}  ${f.table}.${f.col}`);
  console.error(
    '\n  PostgREST answers 42703 and both SDKs throw, which the caller usually catches -'+
      '\n  so this reads as an empty list rather than an error. See XPLAT-013.'+
      '\n'
  );
  process.exit(1);
}

console.log(
  `[mobile-schema] ${columnCheckedSites} explicit column list(s) checked against ${columnsByTable.size} table(s) of columns.`
);
console.log('\nOK No new mobile reference to a table or column that does not exist.');
process.exit(0);
