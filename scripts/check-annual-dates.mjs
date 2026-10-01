#!/usr/bin/env node
/**
 * Annual event dates must not go stale in production (WEB-FEAT-029).
 *
 * WHY THIS EXISTS. IowaStateFairPage.tsx held the fair's dates as a hardcoded
 * const. Its own header comment records that the page previously shipped a fair
 * two years gone, with a 2024 startDate in its Event markup. That was fixed by
 * deriving every mention from one object - which removed the disagreement
 * between the copy and the schema, but not the decay. The object still needed a
 * human edit each year, and nothing noticed when it did not get one. Measured
 * on 2026-09-08: the page was advertising an event that ended 2026-08-23.
 *
 * A comment saying "next year is a single edit" is not a control. This is: the
 * build goes red once an entry's end date is in the past, naming the page and
 * the source to check.
 *
 * IT IS A REGISTRY CHECK, NOT A FAIR CHECK. Every annual landing page added
 * later decays the same way, so the check reads src/lib/annualEvents.ts and
 * covers whatever is in it.
 *
 * OFFLINE. No credentials, no network - it parses the registry and compares
 * calendar dates.
 *
 * Usage:
 *   node scripts/check-annual-dates.mjs
 *   node scripts/check-annual-dates.mjs --today 2026-12-01   # for testing
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'src', 'lib', 'annualEvents.ts');

/**
 * How long after an event ends before the build breaks.
 *
 * Not zero. The morning after the fair closes is not a build emergency, and a
 * check that fires at midnight on the last day would train people to ignore it.
 * Two weeks is long enough to be deliberate and short enough that the dates are
 * never wrong for a whole season.
 */
const GRACE_DAYS = 14;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const todayFlag = argv.indexOf('--today');
  return {
    today: todayFlag !== -1 ? argv[todayFlag + 1] : null,
  };
}

/** YYYY-MM-DD in Des Moines, so "today" never depends on the runner's timezone. */
function todayInCentral() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add days to a YYYY-MM-DD string, staying in plain calendar arithmetic. */
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Pull the entries out of the registry.
 *
 * A regex rather than importing the module, because this is a .mjs script and
 * the registry is TypeScript; adding a transform step for one array would cost
 * more than it returns. The shape is pinned by check-annual-dates' own failure:
 * if the registry stops matching, the parse count drops to zero and this exits
 * non-zero rather than silently passing.
 */
function parseRegistry(source) {
  const events = [];
  const objectPattern = /\{([^{}]*?)\}/gs;
  for (const match of source.matchAll(objectPattern)) {
    const body = match[1];
    const field = (name) => {
      const m = body.match(new RegExp(`${name}:\\s*'([^']*)'`));
      return m ? m[1] : null;
    };
    const id = field('id');
    const startISO = field('startISO');
    const endISO = field('endISO');
    if (!id || !startISO || !endISO) continue;
    events.push({
      id,
      name: field('name') ?? id,
      startISO,
      endISO,
      verifiedAt: field('verifiedAt'),
      sourceUrl: field('sourceUrl'),
      route: field('route'),
    });
  }
  return events;
}

const { today: todayOverride } = parseArgs(process.argv.slice(2));
const today = todayOverride ?? todayInCentral();

if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  fail(`[annual-dates] --today must be YYYY-MM-DD, got ${today}`);
  process.exit(1);
}

let source;
try {
  source = readFileSync(REGISTRY, 'utf8');
} catch (error) {
  fail(`[annual-dates] cannot read ${REGISTRY}: ${error.message}`);
  process.exit(1);
}

const events = parseRegistry(source);

if (events.length === 0) {
  fail(
    '[annual-dates] parsed 0 entries from src/lib/annualEvents.ts.\n' +
      '  Either the registry is empty or its shape changed and this parser needs updating.\n' +
      '  Failing rather than passing vacuously.',
  );
  process.exit(1);
}

const stale = [];
const expiring = [];

for (const event of events) {
  const deadline = addDays(event.endISO, GRACE_DAYS);
  if (today > deadline) stale.push(event);
  else if (today > event.endISO) expiring.push(event);
}

console.log(
  `[annual-dates] ${events.length} annual event(s) checked against ${today} (America/Chicago).`,
);

for (const event of expiring) {
  console.log(
    `  ${event.name}: ended ${event.endISO}, within the ${GRACE_DAYS}-day grace window. Update it soon.`,
  );
}

if (stale.length > 0) {
  fail('');
  fail('STALE ANNUAL DATES');
  for (const event of stale) {
    fail(`  ${event.name} (${event.id})`);
    fail(`    published dates ended ${event.endISO}, more than ${GRACE_DAYS} days ago`);
    if (event.route) fail(`    page:    ${event.route}`);
    if (event.sourceUrl) fail(`    confirm: ${event.sourceUrl}`);
    if (event.verifiedAt) fail(`    last verified ${event.verifiedAt}`);
  }
  fail('');
  fail('Update the entry in src/lib/annualEvents.ts, including verifiedAt.');
  fail('Until then the page renders an honest "dates not announced" state rather');
  fail('than advertising an event that has already happened.');
} else {
  console.log('OK No annual page is advertising an event that has already ended.');
}
