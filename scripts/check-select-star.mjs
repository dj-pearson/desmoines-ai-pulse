#!/usr/bin/env node
/**
 * select('*') in src/hooks and src/pages, ratcheted down (WEB-PERF-035 AC4).
 *
 * WHAT IT COSTS. `select('*')` sends every column the table happens to have,
 * including the ones added later that the caller has never heard of. On
 * `events` and `restaurants` that meant ai_writeup - 250-350 words of prose per
 * row - arriving in list payloads to render cards that show none of it. It also
 * makes the response shape depend on the schema rather than on the caller, so a
 * column added to a table silently changes what every one of these queries
 * returns.
 *
 * A RATCHET, NOT A BAN. 148 of these exist and many are detail-page reads where
 * the full row IS what renders. Demanding zero would fail every build until all
 * of them are triaged, which is how a gate gets deleted. This freezes the
 * current set and fails only on a NEW one - same shape as check-error-handling
 * and check-schema-usage.
 *
 *   node scripts/check-select-star.mjs            # ratchet against the baseline
 *   node scripts/check-select-star.mjs --all      # list every occurrence
 *   node scripts/check-select-star.mjs --update   # re-freeze deliberately
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['src/hooks', 'src/pages'];
const BASELINE = '.github/select-star-baseline.json';
const UPDATE = process.argv.includes('--update');
const ALL = process.argv.includes('--all');

/** select('*') and select("*"), with or without a second argument. */
const PATTERN = /\.select\(\s*(['"])\*\1/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(name)) {
      yield full;
    }
  }
}

/** Comments stripped, so prose about select('*') is not an occurrence of it. */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');
}

const found = [];
for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of walk(root)) {
    const rel = relative('.', file).split(sep).join('/');
    const lines = codeOnly(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) found.push(`${rel}:${i + 1}`);
    });
  }
}
found.sort();

if (ALL) {
  console.log(`[select-star] ${found.length} occurrence(s):`);
  for (const f of found) console.log(`  ${f}`);
  process.exit(0);
}

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify({ count: found.length, sites: found }, null, 2)}\n`);
  console.log(`[select-star] baseline written: ${found.length} occurrence(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`[select-star] ${BASELINE} is missing. Run with --update to create it.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const known = new Set(baseline.sites ?? []);

// LINE NUMBERS MOVE, so a site is only "new" when its FILE gained occurrences.
// Comparing exact line references would fail on every unrelated edit above one,
// which is how a ratchet becomes noise and then gets switched off.
const countByFile = (list) => {
  const m = new Map();
  for (const site of list) {
    const file = site.slice(0, site.lastIndexOf(':'));
    m.set(file, (m.get(file) ?? 0) + 1);
  }
  return m;
};
const before = countByFile([...known]);
const now = countByFile(found);

const regressions = [];
for (const [file, count] of now) {
  const was = before.get(file) ?? 0;
  if (count > was) regressions.push(`${file}: ${was} -> ${count}`);
}

console.log(`[select-star] ${found.length} occurrence(s) across ${now.size} file(s); baseline ${baseline.count}.`);

if (regressions.length > 0) {
  console.error('\nX New select(\'*\') in a hook or page:\n');
  for (const r of regressions) console.error(`  ${r}`);
  console.error(`
Name the columns the caller actually reads. src/lib/listColumns.ts holds the
shared projections; add one there if the table has no constant yet, and
scripts/check-list-columns.mjs will verify every name exists.
`);
  process.exit(1);
}

if (found.length < baseline.count) {
  console.log(`OK ${baseline.count - found.length} fewer than the baseline. Re-baseline with --update to lock it in.`);
} else {
  console.log('OK No new select(\'*\').');
}
