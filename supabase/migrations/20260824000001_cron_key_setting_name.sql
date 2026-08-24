-- WEB-OPS-007 AC1: the 56 cron jobs that authenticate to an edge function read
-- the service-role key from TWO DIFFERENT SETTING NAMES. Standardise on one.
--
-- MEASURED against cron.job, not taken from the story:
--     47 jobs  current_setting('app.settings.supabase_service_role_key')
--      9 jobs  current_setting('app.settings.service_role_key')
--      6 jobs  no key at all (pure SQL maintenance)
--
-- SO AC1 CANNOT BE SATISFIED BY THE ACTION AC1 DESCRIBES. It says to set
-- "app.settings.supabase_url and the service-role key" at the database level.
-- Whichever key name the owner picks, roughly four fifths or one fifth of the
-- jobs keep failing, and they fail with `unrecognized configuration parameter`,
-- which reads exactly like the error they were failing with before - so the
-- obvious conclusion would be that the ALTER DATABASE did not take.
--
-- app.settings.service_role_key wins because it is the name the most recent
-- work already uses: the seven jobs rewritten by 20260823000008 read it, and
-- that migration's own comment tells the owner to set it. Renaming those seven
-- instead would make the documentation false.
--
-- PURE SUBSTITUTION. Only the setting name changes; url, headers, body and
-- schedule are untouched, which is why this can be done generically instead of
-- rewriting 47 commands by hand. All 47 read the key with a strict
-- current_setting() (no missing_ok), verified before writing this, so none of
-- them can fall into AC3's silent-401 mode: with the key unset they RAISE.
--
-- BEHAVIOUR TODAY IS UNCHANGED. Every one of these still fails on every run,
-- and still on app.settings.supabase_url, which is read first and is also
-- unset. What changes is what happens when the owner sets the two settings:
-- 56 jobs start working rather than 9.
--
-- NO KEY VALUE APPEARS HERE. This migration renames a reference, never a value.

DO $migration$
DECLARE
  r       record;
  newcmd  text;
  n       integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; nothing to alter';
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command LIKE '%app.settings.supabase_service_role_key%'
    ORDER BY jobname
  LOOP
    newcmd := replace(
      r.command,
      'app.settings.supabase_service_role_key',
      'app.settings.service_role_key'
    );
    PERFORM cron.alter_job(r.jobid, command => newcmd);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'WEB-OPS-007: renamed the key setting in % cron job(s)', n;

  IF EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%app.settings.supabase_service_role_key%') THEN
    RAISE EXCEPTION 'WEB-OPS-007: % job(s) still reference the old key setting name',
      (SELECT count(*) FROM cron.job WHERE command LIKE '%app.settings.supabase_service_role_key%');
  END IF;
END
$migration$;
