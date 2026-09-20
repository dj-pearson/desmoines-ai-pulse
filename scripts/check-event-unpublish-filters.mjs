#!/usr/bin/env node
/**
 * Both unpublish switches, or neither (WEB-BE-034 AC3).
 *
 *   npm run check-event-unpublish
 *
 * `events` has TWO ways to be off the site and they mean different things:
 *
 *   is_hidden / hidden_at   a moderator or hide_stale_events took this down
 *   archived_at             the agent sweep retired it, reversibly - "set
 *                           archived_at back to null to restore" is the
 *                           documented undo, which is why it is a timestamp
 *
 * They are NOT merged, deliberately: collapsing them would lose which
 * mechanism acted and when. The cost of keeping both is that every reader has
 * to filter both, and WEB-BE-034 records what happens when one is forgotten -
 * "the unpublish job could run correctly and change nothing a visitor or a
 * crawler saw: the event stayed on /events, in the hubs and in
 * sitemap-events.xml".
 *
 * MEASURED 2026-09-20, BEFORE THIS CHECK EXISTED: 130 queries on `events`, and
 * NINETEEN filtered exactly one of the two. Seven filtered is_hidden only -
 * including BOTH sitemap generators, the events hub, the weekly digest, saved
 * search alerts and the daily social post. Twelve filtered archived_at only -
 * every agent surface, so a moderator-hidden event still went out in a digest.
 * The story's own notes said this had been fixed on all 19 reads. It had not.
 *
 * THE RULE IS THE ASYMMETRY, not "every read must filter". Which surfaces are
 * reader-facing cannot be decided from a regex, and admin views legitimately
 * filter neither. A query that filters ONE switch has already decided it cares
 * about visibility, so forgetting the other is provably a mistake - and that is
 * exactly the shape both halves of the defect had.
 *
 * WRITES ARE NOT READS. `.update({ archived_at })` filters archived_at because
 * it is the sweep doing its job; it is skipped rather than baselined.
 *
 * Baselined exceptions are the jobs that OWN a switch and therefore have to see
 * rows the other one hides.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['src', 'supabase/functions', 'scripts'];
const BASELINE = join(ROOT, '.github', 'event-unpublish-baseline.json');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (!/node_modules|\.git|dist|__tests__/.test(p)) walk(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Every `events` query, with which of the two switches it filters.
 * Exported so the rules have a test rather than a reading.
 */
export function scanSource(src, file = '') {
  const found = [];
  for (const m of src.matchAll(/\.from\(\s*['"`]events['"`]\s*\)/g)) {
    const rest = src.slice(m.index + m[0].length);
    // Bound the chain at the next query, exactly as check-schema-usage does:
    // without this, one query absorbs the filters of the next one.
    const stop = rest.search(/\.from\(|\bfromUnknownTable\(/);
    const segment = stop === -1 ? rest.slice(0, 1500) : rest.slice(0, Math.min(stop, 1500));

    // A write is not a reader. The archive sweep's own UPDATE filters
    // archived_at because that is its job.
    if (/^\s*\.(update|insert|upsert|delete)\s*\(/.test(segment)) continue;

    const hidden = /is_hidden/.test(segment);
    const archived = /archived_at/.test(segment);
    if (hidden === archived) continue; // both, or neither - nothing to say

    found.push({
      file,
      line: src.slice(0, m.index).split('\n').length,
      has: hidden ? 'is_hidden' : 'archived_at',
      missing: hidden ? 'archived_at' : 'is_hidden',
    });
  }
  return found;
}

/**
 * Only when run as a script. scanSource() is imported by
 * scripts/__tests__/event-unpublish-filters.test.mjs, and without this guard
 * that import would run the whole check - and process.exit(1) out of the test
 * the moment the check legitimately fails.
 */
function main() {
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { allowed: [] };
  const allowed = new Map((baseline.allowed ?? []).map((a) => [a.site, a.reason]));

  const findings = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const rel = relative(ROOT, file).split('\\').join('/');
      findings.push(...scanSource(readFileSync(file, 'utf8'), rel));
    }
  }

  // A baseline entry keys on file + which switch it has, NOT on the line number,
  // so moving a query does not break the check and adding one is not hidden by an
  // existing entry.
  const key = (f) => `${f.file}#${f.has}`;
  const unexplained = findings.filter((f) => !allowed.has(key(f)));
  const stale = [...allowed.keys()].filter((k) => !findings.some((f) => key(f) === k));

  console.log(`[event-unpublish] ${findings.length} asymmetric query(ies); ${allowed.size} baselined.`);

  if (stale.length) {
    console.error('\nX Baseline entries that no longer match anything:');
    for (const s of stale) console.error(`  ${s}`);
    console.error('\nA stale entry hides the next real one under the same key. Remove it.');
    process.exit(1);
  }

  if (unexplained.length) {
    console.error('\nX These queries filter ONE unpublish switch and not the other:\n');
    for (const f of unexplained) {
      console.error(`  ${f.file}:${f.line}\n    filters ${f.has}, not ${f.missing}`);
    }
    console.error(
      '\n`events` has two unpublish switches and they mean different things - a moderator\n' +
        'hid this row, or the agent sweep retired it. A reader that honours one and not the\n' +
        'other shows rows that have been taken down. Add the missing filter, or add the site\n' +
        'to .github/event-unpublish-baseline.json with the reason it owns one switch.',
    );
    process.exit(1);
  }

  console.log('OK Every events query filters both unpublish switches, or neither.');
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-event-unpublish-filters.mjs');
if (invokedDirectly) main();
