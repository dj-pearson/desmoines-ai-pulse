-- WEB-BE-036 follow-up. The old (title, venue) unique index was never dropped.
--
-- THE DEFECT, and it defeats the whole of 20260902000006. That migration
-- records the production-only object with
--
--     CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_unique
--       ON public.events (title, venue);
--
-- and then retires it with
--
--     ALTER TABLE public.events
--       DROP CONSTRAINT IF EXISTS events_title_venue_unique;
--
-- In Postgres, DROP CONSTRAINT IF EXISTS on a name that belongs to a plain
-- unique INDEX rather than a table constraint is a SILENT NO-OP. It does not
-- error, so the migration reports success. On any database where step 1
-- created the object - which is every database except one where production
-- had already made it a real constraint - the old index SURVIVES.
--
-- WHAT THAT COSTS. events_title_venue_unique is UNIQUE (title, venue) with no
-- date, so the table still holds at most one row per title per venue. The
-- symphony's two performances, a multi-night theatre run, a weekly residency
-- and a Saturday/Sunday pair all still collide - exactly the failure
-- 20260902000006 exists to remove, and exactly what its own AC5 asks someone
-- to verify against production. events_title_venue_date_unique was created and
-- is doing nothing extra, because the narrower index already rejects
-- everything the wider one would.
--
-- The migration's comments show where the reasoning slipped: step 3 calls the
-- object "the old constraint" while step 1 creates an index.
--
-- WHY A NEW FILE rather than an edit. supabase_migrations.schema_migrations
-- records 20260902000006 as applied, so `supabase db push` will never run it
-- again no matter what it contains. Editing an applied migration changes only
-- what a fresh database does, which is the trap WEB-QA-005 documents at
-- length: the trip-planner tables come from a migration the ledger says ran
-- and that never created them.
--
-- SAFE IN ONE RELEASE. This LOOSENS a constraint - it removes a rule that was
-- rejecting legitimate rows. Nothing that reads or writes events depends on
-- the narrower index existing: ingest-events targets
-- events_title_venue_date_unique in its ON CONFLICT, and no shipped mobile
-- binary writes events at all. Per CLAUDE.md the banned direction is
-- tightening, not loosening.

-- Both forms, because the object may be either depending on how the database
-- acquired it, and each statement is a no-op when it is the other. Constraint
-- first: dropping a unique CONSTRAINT also drops the index backing it, so the
-- second statement then finds nothing and does nothing.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_title_venue_unique;

DROP INDEX IF EXISTS public.events_title_venue_unique;

-- Prove it. A migration whose whole job is a deletion should not be able to
-- report success while the object is still there - that is the failure mode
-- being fixed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'events_title_venue_unique'
  ) THEN
    RAISE EXCEPTION 'events_title_venue_unique still exists after both drops';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'events_title_venue_date_unique'
  ) THEN
    RAISE EXCEPTION
      'events_title_venue_date_unique is missing - refusing to leave events with no unique key';
  END IF;

  RAISE NOTICE 'events_title_venue_unique is gone; events_title_venue_date_unique is the key. Recurring events can now be stored.';
END $$;
