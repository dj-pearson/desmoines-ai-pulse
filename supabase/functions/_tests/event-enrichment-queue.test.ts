/**
 * The writeup and SEO queues that pg_cron drives every 15 minutes
 * (20261020000006).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/event-enrichment-queue.test.ts
 *
 * WHAT THIS IS PROTECTING. Both steps cost money per event, and both run
 * unattended now:
 *
 *   - generate-seo-content had no date filter, so it spent on events that had
 *     already happened. bulk-enhance-events had one, behind a "rotating offset"
 *     that read a count from the wrong field. Both must take upcoming events
 *     only, soonest first, and never write to a past one.
 *   - generate-seo-content's lock was seo_title = 'PROCESSING...', cleared only
 *     on a caught error, so a crash locked a row forever. The lock is now
 *     seo_locked_at and goes stale after 15 minutes.
 *
 * The fake below applies the filters to rows rather than recording calls, so a
 * missing .gte('date') shows up as a past event being selected, which is the
 * failure that costs money, not as a different call list.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  clampWriteupBatch,
  saveWriteup,
  selectEventsNeedingWriteup,
} from '../bulk-enhance-events/selection.ts';
import {
  claimSeoLock,
  IMMINENT_HOURS,
  normalizeContentType,
  releaseSeoLock,
  SEO_LOCK_STALE_MINUTES,
  selectSeoCandidates,
} from '../generate-seo-content/selection.ts';

// ---------------------------------------------------------------------------
// A small in-memory PostgREST: the filters these modules use, applied to rows.

type Row = Record<string, unknown>;
type Pred = (r: Row) => boolean;

function unquote(v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

function cmp(a: unknown, b: string): number {
  const as = String(a);
  const ta = Date.parse(as);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  return as < b ? -1 : as > b ? 1 : 0;
}

function op(col: string, operator: string, value: string): Pred {
  switch (operator) {
    case 'is':
      if (value !== 'null') throw new Error(`fake: is.${value}`);
      return (r) => r[col] === null || r[col] === undefined;
    case 'eq':
      return (r) => r[col] !== null && r[col] !== undefined && String(r[col]) === value;
    case 'gte':
      return (r) => r[col] != null && cmp(r[col], value) >= 0;
    case 'lt':
      return (r) => r[col] != null && cmp(r[col], value) < 0;
    default:
      throw new Error(`fake: unsupported operator ${operator}`);
  }
}

/** "a.is.null,b.lt.\"x\"" - flat lists only, which is all the code uses. */
function parseOr(expr: string): Pred {
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of expr) {
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const preds = parts.map((p) => {
    const [col, operator, ...rest] = p.split('.');
    return op(col, operator, unquote(rest.join('.')));
  });
  return (r) => preds.some((pr) => pr(r));
}

class Query {
  private preds: Pred[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max = Infinity;
  private patch: Row | null = null;
  private returning = false;

  constructor(private rows: Row[], private log: string[], private table: string) {}

  select(_cols: string) {
    this.returning = true;
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  eq(col: string, v: string) {
    this.preds.push(op(col, 'eq', v));
    return this;
  }
  gte(col: string, v: string) {
    this.preds.push(op(col, 'gte', v));
    return this;
  }
  lt(col: string, v: string) {
    this.preds.push(op(col, 'lt', v));
    return this;
  }
  is(col: string, v: null) {
    if (v !== null) throw new Error('fake: is() only takes null');
    this.preds.push(op(col, 'is', 'null'));
    return this;
  }
  not(col: string, operator: string, v: null) {
    if (operator !== 'is' || v !== null) throw new Error('fake: not() only takes is null');
    const p = op(col, 'is', 'null');
    this.preds.push((r) => !p(r));
    return this;
  }
  or(expr: string) {
    this.preds.push(parseOr(expr));
    return this;
  }
  order(col: string, opts: { ascending: boolean }) {
    this.orderBy = { col, asc: opts.ascending };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }

  then<T>(resolve: (v: { data: Row[] | null; error: null }) => T) {
    let hit = this.rows.filter((r) => this.preds.every((p) => p(r)));
    if (this.patch) {
      for (const r of hit) {
        Object.assign(r, this.patch);
        this.log.push(`${this.table}:${r.id}:${Object.keys(this.patch).join(',')}`);
      }
      return Promise.resolve({ data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null }).then(resolve);
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      hit = [...hit].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], String(b[col])));
    }
    return Promise.resolve({ data: hit.slice(0, this.max).map((r) => ({ ...r })), error: null }).then(resolve);
  }
}

function fakeDb(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  return {
    writes,
    from: (t: string) => new Query(tables[t] ?? [], writes, t),
  };
}

// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-12T18:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function event(id: string, p: Partial<Row> = {}): Row {
  return { id, title: `Event ${id}`, date: hours(48), ai_writeup: null, seo_title: null, seo_locked_at: null, ...p };
}

// ---- writeup step ---------------------------------------------------------

Deno.test('writeups: upcoming events without a writeup, soonest first', async () => {
  const db = fakeDb({
    events: [
      event('later', { date: hours(72) }),
      event('past', { date: hours(-2) }),
      event('done', { date: hours(1), ai_writeup: 'already written' }),
      event('soon', { date: hours(3) }),
      event('long-past', { date: hours(-24 * 30) }),
    ],
  });
  const picked = await selectEventsNeedingWriteup(db, 10, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['soon', 'later']);
});

Deno.test('writeups: batch size is respected from the front of the queue', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => event(`e${i}`, { date: hours(15 - i) }));
  const picked = await selectEventsNeedingWriteup(fakeDb({ events: rows }), 10, NOW);
  assert.equal(picked.length, 10);
  assert.equal(picked[0].id, 'e14');
  assert.equal(picked[9].id, 'e5');
});

Deno.test('writeups: batch size is clamped', () => {
  assert.equal(clampWriteupBatch(undefined), 10);
  assert.equal(clampWriteupBatch('abc'), 10);
  assert.equal(clampWriteupBatch(0), 10);
  assert.equal(clampWriteupBatch(5), 5);
  assert.equal(clampWriteupBatch(500), 20);
});

Deno.test('writeups: a save is refused for an id outside the batch', async () => {
  // The model returns the ids. One it was never given - a past event, say - is
  // not written, even though the row exists and has no writeup.
  const past = event('past', { date: hours(-5) });
  const db = fakeDb({ events: [past, event('a')] });
  const r = await saveWriteup(db, new Set(['a']), 'past', 'text', 'p', NOW);
  assert.equal(r.ok, false);
  assert.equal(past.ai_writeup, null);
  assert.deepEqual(db.writes, []);
});

Deno.test('writeups: a save never overwrites an existing writeup', async () => {
  const row = event('a', { ai_writeup: 'written by an admin' });
  const db = fakeDb({ events: [row] });
  const r = await saveWriteup(db, new Set(['a']), 'a', 'model text', 'p', NOW);
  assert.equal(r.ok, false);
  assert.equal(row.ai_writeup, 'written by an admin');
});

Deno.test('writeups: a save sets the writeup and its provenance', async () => {
  const row = event('a');
  const db = fakeDb({ events: [row] });
  const r = await saveWriteup(db, new Set(['a']), 'a', 'model text', 'Bulk enhancement (m)', NOW);
  assert.equal(r.ok, true);
  assert.equal(row.ai_writeup, 'model text');
  assert.equal(row.writeup_generated_at, NOW.toISOString());
  assert.equal(row.writeup_prompt_used, 'Bulk enhancement (m)');
});

Deno.test('writeups: an empty writeup is not stored', async () => {
  const row = event('a');
  const r = await saveWriteup(fakeDb({ events: [row] }), new Set(['a']), 'a', '   ', 'p', NOW);
  assert.equal(r.ok, false);
  assert.equal(row.ai_writeup, null);
});

// ---- SEO step -------------------------------------------------------------

Deno.test('seo: past events are never selected', async () => {
  const db = fakeDb({
    events: [
      event('past-with-writeup', { date: hours(-1), ai_writeup: 'w' }),
      event('past-imminent-window', { date: hours(-0.5) }),
      event('upcoming', { date: hours(5), ai_writeup: 'w' }),
    ],
  });
  const picked = await selectSeoCandidates(db, 'event', 10, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['upcoming']);
});

Deno.test('seo: writeup-ready events first, soonest first', async () => {
  const db = fakeDb({
    events: [
      event('w-later', { date: hours(100), ai_writeup: 'w' }),
      event('no-writeup-imminent', { date: hours(2) }),
      event('w-soon', { date: hours(10), ai_writeup: 'w' }),
      event('has-seo', { date: hours(1), ai_writeup: 'w', seo_title: 'Done' }),
    ],
  });
  const picked = await selectSeoCandidates(db, 'event', 2, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['w-soon', 'w-later']);
});

Deno.test('seo: an event without a writeup waits unless it starts within the imminent window', async () => {
  const db = fakeDb({
    events: [
      event('far', { date: hours(IMMINENT_HOURS + 5) }),
      event('imminent', { date: hours(IMMINENT_HOURS - 1) }),
      event('w', { date: hours(30), ai_writeup: 'w' }),
    ],
  });
  const picked = await selectSeoCandidates(db, 'event', 10, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['w', 'imminent']);
});

Deno.test('seo: an empty-string seo_title counts as missing', async () => {
  const db = fakeDb({ events: [event('blank', { seo_title: '', ai_writeup: 'w' })] });
  const picked = await selectSeoCandidates(db, 'event', 10, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['blank']);
});

Deno.test('seo: a fresh lock is skipped, a stale one is reclaimed', async () => {
  const fresh = event('fresh', { ai_writeup: 'w', date: hours(1), seo_locked_at: minutesAgo(2) });
  const stale = event('stale', {
    ai_writeup: 'w',
    date: hours(2),
    seo_locked_at: minutesAgo(SEO_LOCK_STALE_MINUTES + 1),
  });
  const db = fakeDb({ events: [fresh, stale] });

  const picked = await selectSeoCandidates(db, 'event', 10, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['stale']);

  assert.equal(await claimSeoLock(db, 'event', 'fresh', NOW), false);
  assert.equal(fresh.seo_locked_at, minutesAgo(2));

  assert.equal(await claimSeoLock(db, 'event', 'stale', NOW), true);
  assert.equal(stale.seo_locked_at, NOW.toISOString());
});

Deno.test('seo: a held lock does not shrink the batch', async () => {
  const rows = [
    event('held1', { ai_writeup: 'w', date: hours(1), seo_locked_at: minutesAgo(1) }),
    event('held2', { ai_writeup: 'w', date: hours(2), seo_locked_at: minutesAgo(1) }),
    event('a', { ai_writeup: 'w', date: hours(3) }),
    event('b', { ai_writeup: 'w', date: hours(4) }),
  ];
  const picked = await selectSeoCandidates(fakeDb({ events: rows }), 'event', 2, NOW);
  assert.deepEqual(picked.map((e) => e.id), ['a', 'b']);
});

Deno.test('seo: a claim on a row another run just finished is handed back', async () => {
  // Selected while empty, finished by another run before this claim.
  const row = event('a', { ai_writeup: 'w', seo_title: 'Written meanwhile' });
  const db = fakeDb({ events: [row] });
  assert.equal(await claimSeoLock(db, 'event', 'a', NOW), false);
  assert.equal(row.seo_locked_at, null);
});

Deno.test('seo: release frees the row for the next run', async () => {
  const row = event('a', { ai_writeup: 'w' });
  const db = fakeDb({ events: [row] });
  assert.equal(await claimSeoLock(db, 'event', 'a', NOW), true);
  assert.equal(await claimSeoLock(db, 'event', 'a', NOW), false);
  await releaseSeoLock(db, 'event', 'a');
  assert.equal(await claimSeoLock(db, 'event', 'a', NOW), true);
});

Deno.test('seo: content type accepts the table names the heal jobs send', () => {
  assert.equal(normalizeContentType('event'), 'event');
  assert.equal(normalizeContentType('events'), 'event');
  assert.equal(normalizeContentType('restaurant'), 'restaurant');
  assert.equal(normalizeContentType('restaurants'), 'restaurant');
  // Used to fall through to restaurants and write restaurant SEO.
  assert.equal(normalizeContentType('attractions'), null);
  assert.equal(normalizeContentType(undefined), null);
});

// ---- both steps, together -------------------------------------------------

Deno.test('neither step writes to a past event', async () => {
  const past = event('past', { date: hours(-3) });
  const pastWithWriteup = event('past-w', { date: hours(-3), ai_writeup: 'w' });
  const upcoming = event('up', { date: hours(6) });
  const db = fakeDb({ events: [past, pastWithWriteup, upcoming] });

  const forWriteup = await selectEventsNeedingWriteup(db, 10, NOW);
  const ids = new Set(forWriteup.map((e) => e.id));
  for (const e of forWriteup) await saveWriteup(db, ids, e.id, 'text', 'p', NOW);

  const forSeo = await selectSeoCandidates(db, 'event', 10, NOW);
  for (const e of forSeo) await claimSeoLock(db, 'event', e.id, NOW);

  assert.deepEqual(forWriteup.map((e) => e.id), ['up']);
  assert.deepEqual(forSeo.map((e) => e.id), ['up']);
  assert.ok(db.writes.every((w) => w.startsWith('events:up:')), db.writes.join('\n'));
  assert.equal(past.ai_writeup, null);
  assert.equal(past.seo_locked_at, null);
  assert.equal(pastWithWriteup.seo_locked_at, null);
});

// ---- the schedule ---------------------------------------------------------

Deno.test('the cron migration schedules both steps, offset by 7 minutes', () => {
  const sql = Deno.readTextFileSync(
    new URL('../../migrations/20261020000006_schedule_event_writeups_seo.sql', import.meta.url),
  );
  assert.match(sql, /'event-writeups',\s*'\*\/15 \* \* \* \*'/);
  assert.match(sql, /'event-seo',\s*'7-59\/15 \* \* \* \*'/);
  assert.match(sql, /\/functions\/v1\/bulk-enhance-events/);
  assert.match(sql, /\/functions\/v1\/generate-seo-content/);
  assert.match(sql, /'contentType', 'event'/);
  assert.match(sql, /public\.app_secret\('service_role_key'\)/);
});
