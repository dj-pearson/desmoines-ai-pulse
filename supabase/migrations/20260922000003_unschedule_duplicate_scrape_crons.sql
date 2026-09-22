-- Unschedule scrape-events-morning and scrape-events-evening.
--
-- Since 20251123000000, scraping-jobs-runner (every 30 minutes) is the
-- dispatcher: run_scraping_jobs() posts {jobId} for each job whose next_run is
-- due, and 20260902000005 made it the single one. These two older jobs post to
-- scrape-events with NO jobId, which takes a different path - "the ten jobs
-- run longest ago", ignoring next_run - so when they worked they re-ran jobs
-- the runner had just run, paying for the same renders and model calls twice.
--
-- They also do not work. Both read current_setting('app.settings.supabase_url')
-- and ...service_role_key, the pre-Vault settings 20260826000002 moved away
-- from, and both are in cron-health-baseline.json's failing list. Removing them
-- changes no data; the runner already covers every active job.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; nothing to unschedule';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrape-events-morning') THEN
    PERFORM cron.unschedule('scrape-events-morning');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrape-events-evening') THEN
    PERFORM cron.unschedule('scrape-events-evening');
  END IF;
END $$;
