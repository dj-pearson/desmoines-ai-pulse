#!/usr/bin/env node
/**
 * The generated types must not claim something production does not have
 * (WEB-QA-017).
 *
 * check-schema-usage.mjs is this repo's main defence against silently-dead
 * queries, and it compares code to src/integrations/supabase/types.ts. That
 * makes types.ts the reference, and NOTHING CHECKED THE REFERENCE. CLAUDE.md
 * already warns about the direction that is merely annoying:
 *
 *     "ask PostgREST rather than reading the generated types - the types can be
 *      stale, and absence there is not proof"
 *
 * The opposite direction is the dangerous one and is not written down anywhere.
 * If types.ts declares a column production does not have, then:
 *   - the code that selects it type-checks,
 *   - check-schema-usage passes it, because the column is right there in the
 *     reference,
 *   - and PostgREST answers 42703 at runtime, which the hook catches and renders
 *     as an empty state.
 * That is the exact WEB-QA-017 failure mode, arriving through the tool built to
 * prevent it.
 *
 * MEASURED 2026-08-28, first run: 270 tables in types.ts, 269 in the snapshot,
 * 0 ghost columns, 0 real ghost tables. The reference is trustworthy today, and
 * that is worth knowing rather than assuming - several stories rest on it.
 *
 * VIEWS WITH NO CAPTURED COLUMNS ARE SKIPPED, and this is not a fudge. The
 * snapshot lists event_promotion_analytics_summary in `relations` and gives it
 * no entries in `columns`, so a naive comparison calls it a ghost table. It is
 * not: an anon GET answers 200. Reporting it would have been this check's first
 * and only finding, and it would have been wrong.
 *
 * OFFLINE. Reads scripts/db-snapshot.json, whose refresh command is in the
 * header of scripts/check-migration-drift.mjs. A stale snapshot makes this
 * report drift that has already been fixed, so refresh before believing a
 * finding.
 *
 *   node scripts/check-types-drift.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = join(ROOT, 'src', 'integrations', 'supabase', 'types.ts');
const SNAPSHOT = join(ROOT, 'scripts', 'db-snapshot.json');

for (const [label, path] of [['types', TYPES], ['snapshot', SNAPSHOT]]) {
  if (!existsSync(path)) {
    console.error(`[types-drift] ${label} not found at ${path} - refusing to pass.`);
    process.exit(1);
  }
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const relations = new Set(snapshot.relations ?? []);

/** table -> Set(column), from "table.column" strings. */
const production = new Map();
for (const entry of snapshot.columns ?? []) {
  const dot = entry.indexOf('.');
  if (dot === -1) continue;
  const table = entry.slice(0, dot);
  if (!production.has(table)) production.set(table, new Set());
  production.get(table).add(entry.slice(dot + 1));
}

// A CHECK THAT READ NOTHING MUST NOT PASS. Three checks in this repo have
// already reported a clean codebase while measuring zero inputs; see the header
// of check-edge-types.mjs.
if (production.size === 0) {
  console.error('[types-drift] the snapshot lists no columns - refusing to pass.');
  process.exit(1);
}

const types = readFileSync(TYPES, 'utf8');

/**
 * Parse `Tables: { <name>: { Row: { col: type } } }`.
 *
 * Anchored on indentation, which is stable because this file is generated. It
 * is deliberately not a TypeScript parse: pulling in the compiler to read one
 * shape would make an offline check depend on node_modules.
 */
const declared = new Map();
const tableDecl = /^      (\w+): \{$/gm;
for (let m = tableDecl.exec(types); m; m = tableDecl.exec(types)) {
  const rowIdx = types.indexOf('        Row: {', m.index);
  if (rowIdx === -1) continue;
  const end = types.indexOf('\n        }', rowIdx);
  if (end === -1) continue;
  const columns = [...types.slice(rowIdx, end).matchAll(/^          (\w+)\??:/gm)].map((c) => c[1]);
  if (columns.length) declared.set(m[1], new Set(columns));
}

if (declared.size === 0) {
  console.error('[types-drift] parsed no tables out of types.ts - refusing to pass. The generated shape may have changed.');
  process.exit(1);
}

const ghostTables = [];
const ghostColumns = [];
let skippedViews = 0;

for (const [table, columns] of declared) {
  if (!production.has(table)) {
    // In `relations` but with no captured columns: a view the snapshot query
    // does not describe. Present in production, so not a ghost.
    if (relations.has(table)) {
      skippedViews++;
      continue;
    }
    ghostTables.push(table);
    continue;
  }
  for (const column of columns) {
    if (!production.get(table).has(column)) ghostColumns.push(`${table}.${column}`);
  }
}

console.log(
  `[types-drift] ${declared.size} table(s) in types.ts against a snapshot of ` +
    `${production.size} table(s) captured ${snapshot.capturedAt}` +
    (skippedViews ? `, ${skippedViews} column-less relation(s) skipped` : '') +
    '.'
);

if (ghostTables.length === 0 && ghostColumns.length === 0) {
  console.log('OK The generated types claim nothing production does not have.');
  process.exit(0);
}

console.error(`\nX ${ghostTables.length} table(s) and ${ghostColumns.length} column(s) exist only in types.ts:`);
for (const t of ghostTables) console.error(`  table   ${t}`);
for (const c of ghostColumns) console.error(`  column  ${c}`);
console.error(
  '\n  Code selecting these TYPE-CHECKS and PASSES check-schema-usage, because\n' +
    '  types.ts is what that check compares against. PostgREST answers 42P01 or\n' +
    '  42703 at runtime, the hook catches it, and the UI renders an empty state -\n' +
    '  the WEB-QA-017 failure mode arriving through the tool meant to prevent it.\n' +
    '\n' +
    '  Either regenerate types.ts against production, or apply the migration that\n' +
    '  was supposed to create these. Check the snapshot is current first.\n'
);
process.exit(1);
