#!/usr/bin/env node
/**
 * No near-future date literals in Playwright files that leave the clock alone
 * (WEB-QA-041).
 *
 * WHY THIS EXISTS. home-dashboard.spec.ts and home-rails-cls.spec.ts gave their
 * upcoming restaurant openings opening_date: '2026-11-01'. They were written in
 * the autumn, when that meant "soon". On 2026-11-02 the dashboard did what it
 * should with a passed date on an opening_soon row - it dropped it - and two
 * tests in the REQUIRED smoke lane failed on a calendar date, with no code
 * change, for every PR from then on.
 *
 * A date in the past stays in the past, and a date decades out is a deliberate
 * "always upcoming" sentinel (events-hub-list uses 2099). The literal that rots
 * is the one a few months ahead: it flips meaning on a day nobody is watching.
 * So this flags an ISO date between tomorrow and HORIZON_DAYS out, in a file
 * that never touches page.clock. A file that pins the clock is skipped: its
 * literals are measured against the pinned day, not against today.
 *
 * The fix it points at is tests/support/fixtureClock.ts (centralDay(n)), or
 * pinning the clock.
 *
 * IT IS A RATCHET. The literals present when it was written are baselined
 * because nobody has checked whether those specs care (subscription-portal
 * prints "Trial ends October 2, 2026" happily with that date already past). A
 * baselined literal drops out on its own once its date passes; that is
 * reported, never failed, because a check that goes red on a calendar date
 * would be the bug it exists to catch.
 *
 * Comments are stripped first: a comment explaining the rot names the date.
 *
 * Usage:
 *   node scripts/check-fixture-dates.mjs
 *   node scripts/check-fixture-dates.mjs --today 2026-12-01   # for testing
 *   node scripts/check-fixture-dates.mjs --write              # re-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Two years. Far enough to catch "next autumn", short of a 2099 sentinel. */
export const HORIZON_DAYS = 730;

/** Any page.clock / context.clock call: the file measures dates against a pinned day. */
const PINS_CLOCK = /\bclock\s*\.\s*(install|setFixedTime|setSystemTime|runFor|fastForward|pauseAt)\s*\(/;

const ISO_DAY = /(?<![\d-])(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?!\d)/g;

/**
 * Comments blanked out, strings kept, line numbers preserved.
 *
 * It has to know about strings. The regex pair other check-* scripts use read
 * page.route('** /auth/v1/**') (no space) as opening a block comment that the
 * next route glob closed, and silently ate the page.clock call between them -
 * so brewery-trail.spec.ts, which pins the clock, was reported as one that
 * does not.
 */
export function stripComments(text) {
  let out = '';
  let i = 0;
  let quote = null; // ', " or `
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The near-future ISO days in one file's text, or [] when the file pins the
 * clock. `today` is YYYY-MM-DD; a day equal to today is not flagged.
 */
export function findDateBombs(text, today, horizonDays = HORIZON_DAYS) {
  const code = stripComments(text);
  if (PINS_CLOCK.test(code)) return [];
  const limit = addDays(today, horizonDays);
  const out = [];
  code.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(ISO_DAY)) {
      const day = m[0];
      if (day > today && day <= limit) out.push({ line: i + 1, day });
    }
  });
  return out;
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.endsWith('-snapshots')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(full);
  }
  return files;
}

function main() {
  const ROOT = process.cwd();
  const TESTS = join(ROOT, 'tests');
  const BASELINE = join(ROOT, '.github', 'fixture-dates-baseline.json');
  const args = process.argv.slice(2);
  const WRITE = args.includes('--write');
  const todayArg = args.indexOf('--today');
  const today = todayArg >= 0 ? args[todayArg + 1] : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) {
    console.error(`[fixture-dates] --today wants YYYY-MM-DD, got ${today}`);
    process.exit(1);
  }

  if (!existsSync(TESTS)) {
    console.error('[fixture-dates] no tests directory. That is not a pass.');
    process.exit(1);
  }

  const files = walk(TESTS);
  const found = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    for (const hit of findDateBombs(readFileSync(file, 'utf8'), today)) {
      found.push({ ...hit, file: rel, key: `${rel} ${hit.day}` });
    }
  }
  const keys = [...new Set(found.map((f) => f.key))].sort();

  if (WRITE) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          _comment:
            'Near-future date literals in Playwright files that never pin the clock (WEB-QA-041). ' +
            'Each flips from upcoming to past on that day with no code change. This list must only ' +
            'SHRINK: date a new fixture with tests/support/fixtureClock.ts or pin the clock. See ' +
            'scripts/check-fixture-dates.mjs.',
          generated: today,
          literals: keys,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`[fixture-dates] baseline written: ${keys.length} literal(s).`);
    process.exit(0);
  }

  const base = existsSync(BASELINE)
    ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).literals || [])
    : new Set();
  const added = found.filter((f) => !base.has(f.key));
  const gone = [...base].filter((k) => !keys.includes(k));

  if (added.length > 0) {
    console.error(`\n[fixture-dates] ${added.length} near-future date literal(s) in files that never pin the clock:\n`);
    for (const f of added) console.error(`  ${f.file}:${f.line}  ${f.day}`);
    console.error(
      '\nOn that day the fixture stops being upcoming and the spec changes meaning with no\n' +
        'code change. Compute it with centralDay(n) from tests/support/fixtureClock.ts, or\n' +
        'pin the clock with page.clock.setFixedTime and keep the literal.'
    );
    process.exit(1);
  }

  console.log(
    `[fixture-dates] ${files.length} file(s); ${keys.length} near-future literal(s), all already in the baseline.`
  );
  if (gone.length > 0) {
    console.log('No longer found (date passed, or the literal was removed) - re-baseline with --write:');
    for (const k of gone) console.log(`  ${k}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
