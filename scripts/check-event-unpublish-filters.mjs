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
 * THE SECOND RULE (explore plan WP5 item 1): a reader that filters NEITHER.
 *
 * The asymmetry rule above cannot see a hub query that never mentions either
 * switch, and /music, /sports, the venue pages and the team pages were all in
 * that state - an archived or moderator-hidden show stayed on every one of
 * them. Which surfaces are reader-facing still cannot be decided from a regex
 * in general, but src/pages and src/hooks are where the reader surfaces live,
 * so there the rule is: an `events` read must go through applyEventVisibility
 * (or applyHubFilters, which calls it), or filter both switches by hand.
 *
 * A read counts as wrapped when applyEventVisibility( / applyHubFilters( opens
 * in the same statement before `.from('events')`, or when the builder is
 * assigned to a variable that is later passed to one of them. Admin screens
 * are excluded by path, as check-false-empty-state excludes them.
 *
 * Existing sites are ratcheted in UNFILTERED_READERS below (file -> count):
 * a file may not gain one, and when a file loses one the script says so.
 */
const READER_ROOTS = /^src\/(pages|hooks)\//;
const ADMIN_PATH = /(^|\/)(admin|cms|crm)\/|src\/pages\/(Admin|CMS|Campaign)|src\/hooks\/useAdmin|Manager\.(ts|tsx)$|__tests__/;
const WRAPPERS = /\b(applyEventVisibility|applyHubFilters)\s*\(/;

export function isReaderPath(file) {
  return READER_ROOTS.test(file) && !ADMIN_PATH.test(file);
}

/**
 * Every `events` read in `src` that filters neither switch and is not wrapped.
 * Exported so the rule has a test rather than a reading.
 */
export function scanUnfiltered(src, file = '') {
  const found = [];
  for (const m of src.matchAll(/\.from\(\s*['"`]events['"`]\s*\)/g)) {
    const rest = src.slice(m.index + m[0].length);
    const stop = rest.search(/\.from\(|\bfromUnknownTable\(/);
    const segment = stop === -1 ? rest.slice(0, 1500) : rest.slice(0, Math.min(stop, 1500));
    if (/^\s*\.(update|insert|upsert|delete)\s*\(/.test(segment)) continue;
    if (/is_hidden/.test(segment) || /archived_at/.test(segment)) continue; // the asymmetry rule's business

    // The statement this read belongs to, back to the previous ; { or }.
    const before = src.slice(Math.max(0, m.index - 400), m.index);
    const cut = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
    const statement = before.slice(cut + 1);
    if (WRAPPERS.test(statement)) continue;

    const assigned = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[\w$.\s]*$/.exec(statement);
    if (assigned) {
      const name = assigned[1].replace(/\$/g, '\\$');
      const later = src.slice(m.index);
      if (new RegExp(`\\b(?:applyEventVisibility|applyHubFilters)\\s*\\(\\s*${name}\\b`).test(later)) continue;
    }

    found.push({ file, line: src.slice(0, m.index).split('\n').length });
  }
  return found;
}

/**
 * Reader reads that filtered neither switch when the second rule landed
 * (2026-09-24). A ratchet, not a pardon: each is a surface that can still show
 * a taken-down event. Lower a count when you fix one; never raise it.
 */
const UNFILTERED_READERS = {
  // Lookups by id or per-user reads; each still shows a row a moderator took down.
  'src/hooks/useEventIndoorFlags.ts': 1,
  'src/hooks/useNeighborhoodContent.ts': 1,
  'src/hooks/usePushNotifications.ts': 1,
  'src/hooks/useSupabase.ts': 2,
  'src/hooks/useSystemMonitoring.ts': 1,
  'src/pages/ProfilePage.tsx': 1,
};

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

  // Second rule: reader surfaces that filter neither switch.
  const perFile = new Map();
  for (const root of ['src/pages', 'src/hooks']) {
    for (const file of walk(join(ROOT, root))) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (!isReaderPath(rel)) continue;
      const hits = scanUnfiltered(readFileSync(file, 'utf8'), rel);
      if (hits.length) perFile.set(rel, hits);
    }
  }
  const total = [...perFile.values()].reduce((n, h) => n + h.length, 0);
  const allowedTotal = Object.values(UNFILTERED_READERS).reduce((n, c) => n + c, 0);
  console.log(`[event-unpublish] ${total} reader query(ies) filter neither switch; ${allowedTotal} ratcheted.`);

  const over = [];
  for (const [file, hits] of perFile) {
    const allowedCount = UNFILTERED_READERS[file] ?? 0;
    if (hits.length > allowedCount) over.push({ file, hits, allowedCount });
  }
  const fixed = Object.entries(UNFILTERED_READERS).filter(
    ([file, count]) => (perFile.get(file)?.length ?? 0) < count,
  );

  if (over.length) {
    console.error('\nX These reader queries on `events` filter neither unpublish switch:\n');
    for (const { file, hits, allowedCount } of over) {
      console.error(`  ${file}: ${hits.length} (ratchet allows ${allowedCount})`);
      for (const h of hits) console.error(`    line ${h.line}`);
    }
    console.error(
      '\nWrap the query in applyEventVisibility() from @/lib/eventQuery so merged, hidden\n' +
        'and archived events stay off the page. An admin screen belongs under an admin path.',
    );
    process.exit(1);
  }
  if (fixed.length) {
    // Not fatal: several work packages land in parallel, and one fixing a read
    // must not fail another's check. Lower the count so it cannot come back.
    console.log('\nNote: fewer unfiltered reads than ratcheted in UNFILTERED_READERS; lower these:');
    for (const [file, count] of fixed) console.log(`  ${file}: ${count} -> ${perFile.get(file)?.length ?? 0}`);
  }
  console.log('OK No reader surface gained an events query that ignores visibility.');
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-event-unpublish-filters.mjs');
if (invokedDirectly) main();
