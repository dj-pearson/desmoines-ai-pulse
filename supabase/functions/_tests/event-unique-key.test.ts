/**
 * Event uniqueness key (WEB-BE-036).
 *
 * The events table permitted one row per title per venue FOREVER, through a
 * unique index that existed in production and in no migration. A weekly trivia
 * night, a multi-night Playhouse run and the Symphony's Saturday/Sunday
 * performance pair were each one row, and a batch insert lost every row beside
 * the first collision.
 *
 * Three writers key events, in three languages, deployed three different ways:
 * the migration (Postgres), _shared/eventDedup.ts (Deno) and
 * crawlers/catchdesmoines_crawler.py (Python). They drifted before. This test
 * holds them to the same key: title + Central calendar date + venue.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { centralCalendarDate, isDuplicateEvent } from '../_shared/eventDedup.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** SQL line comments, so an explanation cannot satisfy an assertion about SQL. */
const stripSqlComments = (sql: string) => sql.replace(/^\s*--[^\n]*$/gm, '');

const MIGRATION = 'supabase/migrations/20260902000006_events_recurring_unique_key.sql';
/**
 * The drop lives in its own later file. 20260902000006 retired the old object
 * with `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`, which is a silent no-op on
 * a name belonging to a plain unique INDEX - and step 1 of that same migration
 * creates it as an index. So the old (title, venue) key survived and the table
 * still could not hold a recurring event. It could not be fixed in place:
 * schema_migrations records 20260902000006 as applied, so it will never run
 * again.
 */
const DROP_MIGRATION =
  'supabase/migrations/20260919000001_drop_events_title_venue_unique_index.sql';

Deno.test('the migration records the production index, then creates the new one', async () => {
  const sql = await read(MIGRATION);
  const recorded = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_unique');
  const created = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_date_unique');
  assert(recorded > 0, 'the production-only index must be recorded in the ledger');
  assert(created > recorded, 'the new index comes after');
});

Deno.test('the old key is dropped as an INDEX, not only as a constraint', async () => {
  // THE ASSERTION THAT WAS RED, and it was right to be. It looked for the DROP
  // INDEX in 20260902000006, which only ever had the DROP CONSTRAINT - a
  // silent no-op against an index, so events_title_venue_unique survived and
  // every recurring event still collided. The drop now lives in its own
  // migration, because an applied one cannot be repaired by editing it.
  // STRIP THE COMMENTS FIRST. That migration's header QUOTES the defective
  // `DROP CONSTRAINT IF EXISTS ...` to explain what went wrong, so a raw
  // indexOf finds the prose before the statement - and the ordering assertion
  // below passed with the two statements swapped. A check an explanation can
  // satisfy is measuring the explanation.
  const sql = stripSqlComments(await read(DROP_MIGRATION));
  const constraint = sql.indexOf('DROP CONSTRAINT IF EXISTS events_title_venue_unique');
  const index = sql.indexOf('DROP INDEX IF EXISTS public.events_title_venue_unique');

  assert(constraint > 0, 'the constraint form must still be attempted');
  assert(index > 0, 'the INDEX form is the one that was missing');
  // Constraint first: dropping a unique constraint also drops its backing
  // index, so the reverse order would leave the constraint behind.
  assert(index > constraint, 'drop the constraint first, then the index');
});

Deno.test('the drop migration refuses to report success while the index lives', async () => {
  // A migration whose whole job is a deletion must not be able to pass with
  // the object still there. That is precisely how the first attempt failed.
  const sql = await read(DROP_MIGRATION);
  assert(
    /RAISE EXCEPTION[^;]*events_title_venue_unique still exists/.test(sql),
    'the drop must be verified against pg_class, not assumed',
  );
  assert(
    sql.includes('events_title_venue_date_unique is missing'),
    'it must also refuse to leave events with no unique key at all',
  );
});

Deno.test('the new key is title + venue + the Central calendar date', async () => {
  const sql = await read(MIGRATION);
  assert(
    /CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_date_unique\s+ON public\.events \(title, venue, event_local_date\);/.test(sql),
    'the unique index must be on exactly (title, venue, event_local_date)',
  );
  assert(
    /GENERATED ALWAYS AS \(\(date AT TIME ZONE 'America\/Chicago'\)::date\) STORED/.test(sql),
    'event_local_date must be derived in Central time, and stored so it can be indexed',
  );
  // date::date on a timestamptz is STABLE, not IMMUTABLE, and Postgres rejects
  // it in an index. Catching a well-meaning simplification here is the point.
  assert(
    !/\(date::date\)/.test(sql),
    'a bare date::date cast is not immutable and cannot be indexed',
  );
});

Deno.test('ingest-events targets the new index in its ON CONFLICT clause', async () => {
  const src = await read('supabase/functions/ingest-events/index.ts');
  assert(
    /onConflict: "title,venue,event_local_date"/.test(src),
    'the upsert conflict target must name the new index columns',
  );
  assert(!/onConflict: "title,venue"/.test(src), 'the old two-column target must be gone');
  // An expression index cannot be named in an ON CONFLICT inference clause,
  // which is why event_local_date is a real column. If someone converts it back
  // to an expression index, this upsert starts failing at runtime only.
  assert(/ignoreDuplicates: true/.test(src), 'a batch insert must not lose every row to one collision');
});

Deno.test('the Python crawler already keys on title + calendar date + venue', async () => {
  const py = await read('crawlers/catchdesmoines_crawler.py');
  const fn = py.slice(py.indexOf('def _dedupe_key'), py.indexOf('async def _check_duplicate'));
  assert(fn.length > 0, '_dedupe_key must exist ahead of _check_duplicate');
  assert(/_record_title\(event\)/.test(fn), 'title is part of the key');
  assert(/parsed_dt\.date\(\)\.isoformat\(\)/.test(fn), 'the calendar date, not the instant');
  assert(/_record_venue\(event\)/.test(fn), 'venue is part of the key');
});

Deno.test('tier 3 keys on the Central day, so an evening show is not split across two UTC days', () => {
  // 8pm CDT on Sep 9 is 01:00Z on Sep 10. Keyed in UTC these are different
  // days; in Des Moines they are one evening.
  assertEquals(centralCalendarDate('2026-09-10T01:00:00.000Z'), '2026-09-09');
  assertEquals(centralCalendarDate('2026-09-09T23:00:00.000Z'), '2026-09-09');

  const v = isDuplicateEvent(
    {
      title: 'Open Mic Night',
      date: new Date('2026-09-10T01:00:00.000Z'),
      venue: 'Woolys',
      source_url: 'https://firstfleetconcerts.com/a',
    },
    [{
      id: '1',
      title: 'open mic night',
      venue: 'woolys',
      date: '2026-09-09T23:00:00.000Z',
      source_url: 'https://firstfleetconcerts.com/b',
    }],
  );
  assert(v.isDuplicate);
  assertEquals(v.reason, 'same_title_venue_same_day');
});

Deno.test('a weekly residency and a two-performance weekend both survive', () => {
  const base = {
    title: 'Open Mic Night',
    venue: 'Woolys',
    source_url: 'https://firstfleetconcerts.com/a',
  };
  const existingRow = {
    id: '1',
    ...base,
    date: '2026-09-09T23:00:00.000Z',
    source_url: 'https://firstfleetconcerts.com/b',
  };

  // A week later: a real second event.
  assertFalse(
    isDuplicateEvent({ ...base, date: new Date('2026-09-16T23:00:00.000Z') }, [existingRow]).isDuplicate,
  );

  // The Symphony pair: Saturday 8pm and Sunday 2pm, 18 hours apart. The old
  // 24-hour window collapsed these; eventSourceProfiles says both must exist.
  assertFalse(
    isDuplicateEvent(
      { ...base, title: 'Beethoven Symphony No 9', venue: 'Civic Center', date: new Date('2026-10-04T19:00:00.000Z') },
      [{ id: '2', title: 'Beethoven Symphony No 9', venue: 'Civic Center', date: '2026-10-04T01:00:00.000Z', source_url: 'https://dmsymphony.org/b' }],
    ).isDuplicate,
  );
});

Deno.test('the retired 24-hour window is gone from the module and its docs', async () => {
  const src = await read('supabase/functions/_shared/eventDedup.ts');
  assert(!/RECURRING_WINDOW_HOURS/.test(src), 'the 24-hour constant must be retired, not left dangling');
  // The header still NAMES the retired string to explain the rename; what must
  // be gone is any code path that returns it.
  assert(
    !/reason: "same_title_venue_within_24h"/.test(src),
    'no code path may still report the retired 24-hour reason',
  );
  assert(/reason: "same_title_venue_same_day"/.test(src));
});
