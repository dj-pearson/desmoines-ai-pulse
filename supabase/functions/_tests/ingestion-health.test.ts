/**
 * The zero-result alert rule for ingestion sources (WEB-BE-043 AC6).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/ingestion-health.test.ts
 *
 * WHAT THIS IS PROTECTING. SeatGeek - 375 events, the largest single source in
 * the corpus - stopped ingesting on 2026-08-21 and nothing reported it. Every
 * run returned 200, pg_cron recorded "succeeded", and the only evidence was
 * that the number of new events had quietly become zero. This rule is the one
 * thing standing between that happening again and somebody noticing months
 * later, so its two failure modes are what the tests pin:
 *
 *   - it alerts when a source that used to produce stops producing, and
 *   - it does NOT alert on a source that never produced, or on a quiet run,
 *     because a watchdog that pages on normal days gets muted and then the
 *     first real alert is muted too.
 *
 * node:assert rather than std/assert deliberately: it needs no network, so this
 * runs in a container where deno.land is unreachable as well as in CI.
 */

import { strict as assert } from 'node:assert';
import {
  ERROR_RATE_THRESHOLD,
  evaluateIngestionHealth,
  hubIngestStale,
  INGESTION_JOB_MAX_AGE_HOURS,
  readSourceCounts,
  ZERO_INSERT_STREAK,
  GITHUB_CRAWLER_JOB,
  type LedgerRun,
  type SourceCounts,
} from '../_shared/ingestionHealth.ts';

function counts(p: Partial<SourceCounts> = {}): SourceCounts {
  return { fetched: 0, inserted: 0, duplicates: 0, errors: 0, ...p };
}

/** Newest first, like the watchdog's `.order('started_at', { ascending: false })`. */
function runs(...sources: Record<string, SourceCounts>[]): LedgerRun[] {
  return sources.map((s, i) => ({
    started_at: new Date(Date.UTC(2026, 8, 19 - i)).toISOString(),
    status: 'success',
    metadata: { sources: s },
  }));
}

Deno.test('three zero-insert runs after a non-zero baseline alerts', () => {
  const ledger = runs(
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40, inserted: 12 }) },
  );
  const alerts = evaluateIngestionHealth('scrape-events', ledger);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].rule, 'zero_inserted_streak');
  assert.equal(alerts[0].source, 'seatgeek');
  assert.match(alerts[0].message, /gone dark/);
});

Deno.test('a source that never inserted anything does not alert', () => {
  // The misconfigured-job case. It is a real problem and it is not this rule's:
  // paging about it nightly is how the alert that matters gets ignored.
  const ledger = runs(
    { newsource: counts({ fetched: 5 }) },
    { newsource: counts({ fetched: 5 }) },
    { newsource: counts({ fetched: 5 }) },
    { newsource: counts({ fetched: 5 }) },
  );
  assert.deepEqual(evaluateIngestionHealth('scrape-events', ledger), []);
});

Deno.test('one good run inside the streak clears it', () => {
  const ledger = runs(
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40, inserted: 3 }) },
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40, inserted: 12 }) },
  );
  assert.deepEqual(evaluateIngestionHealth('scrape-events', ledger), []);
});

Deno.test('fewer than three completed runs never alerts', () => {
  const ledger = runs(
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40, inserted: 9 }) },
  );
  assert.deepEqual(evaluateIngestionHealth('scrape-events', ledger), []);
});

Deno.test('a run still in flight does not blind the rule', () => {
  // runJob opens a 'running' row and closes it at the end, so the watchdog can
  // read one mid-run. It carries no counts, and if it were allowed into the
  // window it would push a real run out of the streak and silence the alert -
  // permanently, for any job whose run overlaps the watchdog's.
  const ledger: LedgerRun[] = [
    { started_at: '2026-09-19T00:00:00Z', status: 'running', metadata: null },
    ...runs(
      { seatgeek: counts({ fetched: 40 }) },
      { seatgeek: counts({ fetched: 40 }) },
      { seatgeek: counts({ fetched: 40 }) },
      { seatgeek: counts({ fetched: 40, inserted: 7 }) },
    ),
  ];
  const alerts = evaluateIngestionHealth('scrape-events', ledger);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].rule, 'zero_inserted_streak');
});

Deno.test('a paused run is not evidence either way', () => {
  // A kill-switched job writes status 'skipped' with a pausedReason and no
  // counts. It is neither a zero-insert run nor a healthy one; it drops out and
  // the runs around it close up.
  const ledger: LedgerRun[] = [
    ...runs({ seatgeek: counts({ fetched: 40 }) }, { seatgeek: counts({ fetched: 40 }) }),
    { started_at: '2026-09-17T00:00:00Z', status: 'skipped', metadata: { pausedReason: 'global_kill_switch' } },
    ...runs({ seatgeek: counts({ fetched: 40 }) }, { seatgeek: counts({ fetched: 40, inserted: 7 }) }),
  ];
  const alerts = evaluateIngestionHealth('scrape-events', ledger);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].source, 'seatgeek');
});

Deno.test('a partial run is a real run and counts', () => {
  // 'partial' is what runJob writes when some items failed but the body did
  // not throw. Excluding it with the pauses would hide the slow-decay case
  // this rule is for.
  const ledger: LedgerRun[] = runs(
    { seatgeek: counts({ fetched: 40, errors: 2 }) },
    { seatgeek: counts({ fetched: 40, errors: 1 }) },
    { seatgeek: counts({ fetched: 40 }) },
    { seatgeek: counts({ fetched: 40, inserted: 7 }) },
  ).map((r, i) => (i === 0 ? { ...r, status: 'partial' } : r));
  const alerts = evaluateIngestionHealth('scrape-events', ledger);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].rule, 'zero_inserted_streak');
});

Deno.test('one dark source does not implicate its healthy neighbours', () => {
  const ledger = runs(
    { seatgeek: counts({ fetched: 40 }), ticketmaster: counts({ fetched: 20, inserted: 4 }) },
    { seatgeek: counts({ fetched: 40 }), ticketmaster: counts({ fetched: 20, inserted: 6 }) },
    { seatgeek: counts({ fetched: 40 }), ticketmaster: counts({ fetched: 20, inserted: 2 }) },
    { seatgeek: counts({ fetched: 40, inserted: 30 }), ticketmaster: counts({ fetched: 20, inserted: 5 }) },
  );
  const alerts = evaluateIngestionHealth('scrape-events', ledger);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].source, 'seatgeek');
});

Deno.test('errors above half of fetched alert on the newest run alone', () => {
  const ledger = runs({ firecrawl: counts({ fetched: 10, errors: 6, inserted: 4 }) });
  const alerts = evaluateIngestionHealth('firecrawl-scraper', ledger);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].rule, 'error_rate');
  assert.match(alerts[0].message, /6 of 10/);
});

Deno.test('exactly half the items erroring is under the threshold', () => {
  assert.equal(ERROR_RATE_THRESHOLD, 0.5);
  const ledger = runs({ firecrawl: counts({ fetched: 10, errors: 5, inserted: 5 }) });
  assert.deepEqual(evaluateIngestionHealth('firecrawl-scraper', ledger), []);
});

Deno.test('a quiet day - nothing fetched, nothing inserted - is not an error rate', () => {
  // 0/0 must not become NaN or Infinity and page every night the calendar is empty.
  const ledger = runs({ firecrawl: counts() }, { firecrawl: counts() }, { firecrawl: counts() });
  assert.deepEqual(evaluateIngestionHealth('firecrawl-scraper', ledger), []);
});

Deno.test('the legacy perSource array shape is read, not skipped', () => {
  // restaurant-opening-scraper wrote this shape first (WEB-BE-041); rows in it
  // are already in the table.
  const meta = {
    perSource: [
      { name: 'Des Moines Register', ok: true, found: 8, inserted: 2, updated: 1 },
      { name: 'Catch Des Moines', ok: false, found: 0, inserted: 0, updated: 0, error: 'scrape failed' },
    ],
  };
  const parsed = readSourceCounts(meta);
  assert.equal(parsed['Des Moines Register'].fetched, 8);
  // `updated` counts as a write: a source that only refreshes rows is alive.
  assert.equal(parsed['Des Moines Register'].inserted, 3);
  assert.equal(parsed['Catch Des Moines'].errors, 1);
});

Deno.test('metadata with neither shape yields no sources rather than throwing', () => {
  assert.deepEqual(readSourceCounts(null), {});
  assert.deepEqual(readSourceCounts({ deleted: 12 }), {});
  assert.deepEqual(readSourceCounts({ sources: 'nonsense' }), {});
});

Deno.test('hub staleness: never-written reads as not stale, not as stale', () => {
  // "The hub has not started" and "the hub stopped" send an operator to
  // different places.
  assert.deepEqual(hubIngestStale(null, Date.now()), { stale: false, ageHours: null });
  assert.deepEqual(hubIngestStale('not a date', Date.now()), { stale: false, ageHours: null });
});

Deno.test('hub staleness: 49h stale, 47h not', () => {
  const now = Date.UTC(2026, 8, 19, 12, 0, 0);
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  assert.equal(hubIngestStale(at(49), now).stale, true);
  assert.equal(hubIngestStale(at(47), now).stale, false);
});

Deno.test('scrape-events is watched at its 30-minute cadence, not a daily one', () => {
  // The cadence entry is the half of this story the counts cannot cover: a job
  // that stops being invoked writes no rows at all, so no per-source rule can
  // see it.
  assert.equal(INGESTION_JOB_MAX_AGE_HOURS['scrape-events'], 1);
  assert.equal(INGESTION_JOB_MAX_AGE_HOURS['github-event-crawler'], 48);
  assert.equal(ZERO_INSERT_STREAK, 3);
});

// ---------------------------------------------------------------------------
// The wiring half (WEB-BE-043 AC2/AC3). The rule above is only worth anything
// if something writes the counts it reads, and that is exactly the part that
// rots quietly: a new ingestion function ships, nobody wraps it, and the
// watchdog goes on reporting healthy about the six it knows.
// ---------------------------------------------------------------------------

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));

/** Comments are stripped before asserting, or a check is satisfied by the
 *  comment that explains it. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/** Every function that writes content rows from an external source. */
const INGESTION_FUNCTIONS = [
  'scrape-events',
  'firecrawl-scraper',
  'ai-crawler',
  'ingest-events',
  'restaurant-opening-scraper',
  'bulk-update-restaurants',
  'auto-enrich-restaurants',
];

Deno.test('every ingestion function records a run with per-source counts', async () => {
  for (const fn of INGESTION_FUNCTIONS) {
    const src = codeOnly(await read(`supabase/functions/${fn}/index.ts`));
    assert.match(
      src,
      /import \{[^}]*runJob[^}]*\} from ['"]\.\.\/_shared\/jobRunner\.ts['"]/,
      `${fn} must import runJob - a run it does not record cannot be missed`,
    );
    assert.match(src, /runJob\(/, `${fn} imports runJob but never calls it`);
    // `sources,` (shorthand) and `sources: {` both count.
    assert.match(
      src,
      /\bsources\s*[,:]/,
      `${fn} records a run but no per-source counts, so the zero-result rule has nothing to read`,
    );
  }
});

Deno.test('the watchdog watches every ingestion job it should', async () => {
  const watchdog = codeOnly(await read('supabase/functions/job-health-watchdog/index.ts'));
  assert.match(
    watchdog,
    /\.\.\.INGESTION_JOB_MAX_AGE_HOURS/,
    'the watchdog must take the ingestion cadences from the shared table, not a second copy',
  );
  assert.match(watchdog, /evaluateIngestionHealth\(/, 'the watchdog must apply the per-source rule');
  assert.match(watchdog, /hubIngestStale\(/, 'the watchdog must check the hub ingest door');
  for (const fn of INGESTION_FUNCTIONS) {
    assert.ok(
      INGESTION_JOB_MAX_AGE_HOURS[fn] !== undefined,
      `${fn} writes ledger rows but has no expected cadence, so a job that stops running is invisible`,
    );
  }
});

Deno.test('cleanup-old-events is watched at its nightly cadence', async () => {
  // 20260612000014 moved it off the weekly cron; the watchdog's entry stayed at
  // two weeks, so it could miss thirteen nightly runs before saying anything.
  const watchdog = codeOnly(await read('supabase/functions/job-health-watchdog/index.ts'));
  const entry = watchdog.match(/'cleanup-old-events':\s*([^,]+),/);
  assert.ok(entry, 'the watchdog must still have a cleanup-old-events entry');
  assert.equal(
    entry![1].trim(),
    '48',
    'cleanup-old-events runs nightly; 2x that is 48h, not the 24 * 14 the entry carried',
  );
});

Deno.test('the GitHub crawler posts its own heartbeat row', async () => {
  // Nothing inside Supabase schedules this crawler, so nothing inside Supabase
  // can tell "ran and found nothing" from "has not run since February" - which
  // is what happened for six months (WEB-SEO-017).
  const crawler = await read('crawlers/catchdesmoines_crawler.py');
  // Python, so codeOnly's JS comment forms do not apply; the strings asserted
  // below are all inside the row literal, not in a docstring.
  assert.match(crawler, /"automation_job_runs"/, 'the crawler must write to the run ledger');
  assert.match(
    crawler,
    new RegExp(`"job_name":\\s*"${GITHUB_CRAWLER_JOB}"`),
    `the heartbeat must use the job name the watchdog watches (${GITHUB_CRAWLER_JOB})`,
  );
  assert.match(crawler, /"sources":\s*\{/, 'the heartbeat must carry per-source counts');
  assert.match(
    crawler,
    /crawler\.post_heartbeat\(None\)/,
    'a crash mid-crawl is the case the ledger most needs to record',
  );
});
