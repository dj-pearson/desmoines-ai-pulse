-- WEB-BE-036: the events table could not hold a recurring event.
--
-- `public.events` carries a UNIQUE INDEX `events_title_venue_unique` on
-- (title, venue) with no date in it: one row per title per venue, forever. It
-- exists in production and in no migration, so the ledger never described the
-- strictest rule in the schema. A weekly trivia night, a Playhouse run and the
-- Symphony's Saturday-evening / Sunday-matinee pair are all one row under it.
--
-- Measured 2026-08-29 on the first live hub ingest: 88 events extracted, the
-- shared dedup passed 60, and Postgres refused 16 of those on this constraint.
-- A batch insert is one statement, so the first collision lost every row
-- beside it -- which is why ingest-events had to switch to ON CONFLICT DO
-- NOTHING and report `constraintDuplicates` separately from `duplicates`.
--
-- THE KEY EVERY WRITER ALREADY WANTED is title + calendar date + venue:
--   * crawlers/catchdesmoines_crawler.py `_dedupe_key` is exactly that, and its
--     docstring says "Title alone collapses a weekly trivia night";
--   * _shared/centralTime.ts calls it "the title_date_venue dedupe key";
--   * _shared/eventDedup.ts tier 3 approximated it with a 24-hour window.
-- Only the database disagreed. This migration makes the database agree.
--
-- WHY A GENERATED COLUMN RATHER THAN AN EXPRESSION INDEX. `events.date` is
-- TIMESTAMPTZ, so `date::date` depends on the session TimeZone and Postgres
-- rejects it in an index (it is STABLE, not IMMUTABLE).
-- `(date AT TIME ZONE 'America/Chicago')::date` IS immutable and is the right
-- answer anyway: every event here is a Des Moines event, and an 8pm Saturday
-- show and a 2pm Sunday matinee are different days in Central time whatever
-- they are in UTC. A plain stored column also lets PostgREST target the index
-- from `on_conflict=title,venue,event_local_date`; an expression index cannot
-- be named in an ON CONFLICT inference clause, and ingest-events needs one.
--
-- WHY NOT CONCURRENTLY, which the story asked for: a migration file is one
-- transaction and CREATE INDEX CONCURRENTLY is rejected inside one. It would
-- also buy nothing here, because adding the STORED generated column below
-- rewrites the table and takes a heavier lock than the index build. `events`
-- is ~900 rows, so both are milliseconds.
--
-- LOOSENING, NOT TIGHTENING. The new key permits strictly more rows than the
-- old one: anything that inserted before still inserts. Per CLAUDE.md that
-- makes it safe in a single release, and no shipped mobile binary is affected
-- (both read events, neither writes them).

-- ---------------------------------------------------------------------------
-- 1. Record the production-only index in the ledger, so the drift report and
--    this file finally describe the same database. In production this is a
--    no-op; on a database that never had it, it is created and then dropped in
--    step 4, which is harmless. If a database holds rows the production index
--    would reject, this raises and the operator learns that here rather than
--    from a failed ingest.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_unique
    ON public.events (title, venue);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'events_title_venue_unique could not be created here (duplicate title+venue rows exist); it is being replaced below anyway';
END $$;

-- ---------------------------------------------------------------------------
-- 2. The calendar-date column. Additive and nullable: a row with a NULL date
--    gets a NULL here and, like today, collides with nothing.
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_local_date DATE
  GENERATED ALWAYS AS ((date AT TIME ZONE 'America/Chicago')::date) STORED;

COMMENT ON COLUMN public.events.event_local_date IS
'WEB-BE-036. The Central-time calendar date of `date`, maintained by Postgres. Exists so (title, venue, event_local_date) can be a plain-column unique index that PostgREST can target in an ON CONFLICT clause. Never written by a client.';

-- ---------------------------------------------------------------------------
-- 3. The new key. Built BEFORE the old index is dropped, so the old constraint
--    is still guarding the table while this runs. That ordering also makes the
--    build provably safe: no two rows can share (title, venue) while
--    events_title_venue_unique holds, so no two can share
--    (title, venue, event_local_date) either.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_date_unique
  ON public.events (title, venue, event_local_date);

COMMENT ON INDEX public.events_title_venue_date_unique IS
'WEB-BE-036. Replaces events_title_venue_unique. One row per title per venue PER CENTRAL CALENDAR DAY, so a weekly residency, a multi-night run and a Saturday/Sunday performance pair are all storable. Matches crawlers/catchdesmoines_crawler.py _dedupe_key and _shared/eventDedup.ts tier 3.';

-- ---------------------------------------------------------------------------
-- 4. Retire the old one, and report what the change unlocks.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.events_title_venue_unique;

DO $$
DECLARE
  n_groups integer;
BEGIN
  SELECT count(*) INTO n_groups
    FROM (
      SELECT title, venue
        FROM public.events
       WHERE title IS NOT NULL AND venue IS NOT NULL
       GROUP BY title, venue
      HAVING count(DISTINCT event_local_date) > 1
    ) g;
  RAISE NOTICE 'WEB-BE-036: events now keyed on (title, venue, event_local_date); % title+venue group(s) already span more than one day', n_groups;
END $$;
