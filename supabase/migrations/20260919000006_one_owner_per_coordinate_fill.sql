-- WEB-BE-050: one owner per fill. Three jobs were geocoding the same rows.
--
-- WHAT WAS SCHEDULED:
--   02:00  nightly-coordinate-backfill      -> backfill-all-coordinates
--   02:30  data-quality-heal-nightly        -> data-quality-heal (stage 1 geocodes)
--   04:30  backfill-coordinates-nightly     -> the same work, from 20250107000004,
--                                             never unscheduled when the others landed
--   08:00  data-quality-sweeper             -> tier-1 auto-fill incl. coordinates
--
-- Every one of them selects rows where latitude IS NULL and geocodes them. The
-- first to run each night does the work and the rest find nothing, which is why
-- this has never shown up as a cost or an error - it shows up as three jobs
-- whose success proves nothing, and as nobody being able to say which one to
-- look at when coordinates are missing.
--
-- KEEPING data-quality-heal, because it is the only one that records an
-- attempt count per row (heal_attempts) and escalates a row that keeps failing.
-- The two plain backfills retry the same unresolvable addresses forever and
-- report success either way.
--
-- NOT TOUCHING data-quality-sweeper, and the AC asked for its coordinate step
-- to go too. It is an AOS agent with its own escalation path and run ledger,
-- and choosing between two jobs that both escalate is a design call that needs
-- the production fill rates of each - which this container cannot read. The
-- duplication left is one job, at a different hour, with its own observability;
-- the two silent ones are the problem being fixed here.
--
-- REVERSIBLE. Both job definitions stay in the migration history; re-scheduling
-- either is a cron.schedule away.

DO $do$
DECLARE
  removed text[] := ARRAY[]::text[];
  v_jobname text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; nothing to unschedule';
    RETURN;
  END IF;

  -- Checked BEFORE anything is removed. A failure here rolls the unschedules
  -- back anyway - one transaction - but a NOTICE saying two jobs were removed
  -- followed by an exception is a log nobody can read correctly.
  IF NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'data-quality-heal-nightly') THEN
    RAISE EXCEPTION 'WEB-BE-050: data-quality-heal-nightly is not scheduled, so unscheduling the backfills would leave no job geocoding anything. Schedule it (20260612000006) and re-run.';
  END IF;

  FOREACH v_jobname IN ARRAY ARRAY['nightly-coordinate-backfill', 'backfill-coordinates-nightly']
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v_jobname) THEN
      PERFORM cron.unschedule(v_jobname);
      removed := removed || v_jobname;
    END IF;
  END LOOP;

  -- The number this migration is judged by. 0 removed on a database that has
  -- these jobs means the names drifted, not that the work was already done.
  RAISE NOTICE 'WEB-BE-050: unscheduled % duplicate coordinate job(s): %',
    coalesce(array_length(removed, 1), 0),
    coalesce(array_to_string(removed, ', '), 'none');
END
$do$;
