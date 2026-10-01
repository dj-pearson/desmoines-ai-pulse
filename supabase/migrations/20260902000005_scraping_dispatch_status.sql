-- WEB-BE-035: the cloud scraper could never run a dispatched job.
--
-- run_scraping_jobs (cron scraping-jobs-runner, every 30 min) selected
-- WHERE status != 'running', flipped the row to 'running', then POSTed
-- {jobId} to scrape-events. scrape-events built its lookup as
-- .eq('status', 'idle') plus .eq('id', jobId), found nothing, and answered
-- "No scraping job found". Nothing reset the row: pg_net is asynchronous, so
-- the EXCEPTION branch that would have restored 'idle' never fired. After one
-- dispatch every job sat at 'running' forever and the WHERE excluded it.
-- 20260830000002 fixed the credentials and left this logic alone.
--
-- A second dispatcher, trigger_due_scraping_jobs (cron
-- auto-trigger-scraping-jobs, every 10 min), selected status = 'idle', set
-- running + last_run = NOW(), POSTed, and set idle again in the same
-- transaction. Its status dance was harmless, but writing last_run at dispatch
-- meant scrape-events' own recency check ("skip if scraped within 15 minutes
-- and it found events") skipped every productive job it dispatched. And with
-- run_scraping_jobs parking rows at 'running', its idle-only SELECT saw fewer
-- jobs each cycle.
--
-- Fix, in one place each:
--   1. run_scraping_jobs is restated below as the single dispatcher. It writes
--      next_run only. No status, no last_run: scrape-events owns both, and
--      writes them when a job actually finishes.
--   2. auto-trigger-scraping-jobs is unscheduled. Two dispatchers with two
--      cadences double-posted the same jobs; trigger_due_scraping_jobs stays
--      defined (nothing drops a function) but nothing calls it.
--   3. Rows stuck at 'running' are repaired to 'idle'.
--   4. scrape-events (same commit) accepts status in ('idle','running') when
--      given a jobId and writes status = 'idle' + last_run on completion.
--
-- Credentials: public.app_secret('service_role_key'), the Vault reader that
-- 20260826000002 introduced and 20260830000002 patched into this function.
-- Restating the body must not regress that, so it is written in directly and
-- the function RAISEs when the secret is absent rather than posting an
-- unauthenticated request that pg_cron would record as SUCCESS.

CREATE OR REPLACE FUNCTION public.run_scraping_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  function_url TEXT;
  v_key TEXT;
  dispatched INTEGER := 0;
BEGIN
  function_url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events';
  v_key := public.app_secret('service_role_key');

  -- 'Bearer ' || NULL is NULL, the header vanishes, the POST is enqueued,
  -- pg_cron records SUCCESS and scrape-events 401s where nobody looks. Raise.
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'run_scraping_jobs not run: vault secret service_role_key is missing';
  END IF;

  INSERT INTO public.cron_logs (message, created_at)
  VALUES ('Starting scheduled scraping job run', NOW());

  FOR job_record IN
    SELECT *
      FROM public.scraping_jobs
     WHERE next_run <= NOW()
       AND (config->>'isActive')::boolean = true
     ORDER BY next_run
  LOOP
    BEGIN
      next_run_time := CASE
        WHEN job_record.config->>'schedule' = '0 */1 * * *' THEN NOW() + INTERVAL '1 hour'
        WHEN job_record.config->>'schedule' = '0 */2 * * *' THEN NOW() + INTERVAL '2 hours'
        WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
        WHEN job_record.config->>'schedule' = '0 */4 * * *' THEN NOW() + INTERVAL '4 hours'
        WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
        WHEN job_record.config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
        WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN
          CASE
            WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
          END
        WHEN job_record.config->>'schedule' = '0 6 * * 1' THEN NOW() + INTERVAL '7 days'
        WHEN job_record.config->>'schedule' = '0 6 1 * *' THEN NOW() + INTERVAL '30 days'
        ELSE NOW() + INTERVAL '6 hours'
      END;

      -- next_run advances BEFORE the POST so a slow or failed scrape cannot
      -- be re-dispatched every 30 minutes. status and last_run are not
      -- touched here: scrape-events writes both when the job finishes.
      UPDATE public.scraping_jobs
         SET next_run = next_run_time,
             updated_at = NOW()
       WHERE id = job_record.id;

      PERFORM net.http_post(
        url     := function_url::text,
        body    := jsonb_build_object('jobId', job_record.id, 'triggerSource', 'cron'),
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_key,
                     'x-trigger-source', 'cron'
                   )
      );

      dispatched := dispatched + 1;

      INSERT INTO public.cron_logs (message, job_id, created_at)
      VALUES ('Dispatched scraping job: ' || job_record.name, job_record.id, NOW());

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at)
      VALUES ('Error dispatching scraping job: ' || job_record.name, job_record.id, SQLERRM, NOW());
    END;
  END LOOP;

  INSERT INTO public.cron_logs (message, created_at)
  VALUES ('Scheduled scraping job run dispatched ' || dispatched || ' job(s)', NOW());

  -- Keep the last 100 log rows.
  DELETE FROM public.cron_logs
   WHERE id NOT IN (
     SELECT id FROM public.cron_logs ORDER BY created_at DESC LIMIT 100
   );
END;
$$;

-- One dispatcher. trigger_due_scraping_jobs stays defined; nothing calls it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; nothing to unschedule';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-trigger-scraping-jobs') THEN
    PERFORM cron.unschedule('auto-trigger-scraping-jobs');
    RAISE NOTICE 'unscheduled auto-trigger-scraping-jobs (duplicate dispatcher)';
  END IF;
END $$;

-- Repair: rows parked at 'running' by the old dispatcher. Nothing legitimately
-- holds 'running' any more, so every one of them is stuck.
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE public.scraping_jobs
     SET status = 'idle', updated_at = NOW()
   WHERE status = 'running';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'WEB-BE-035 repair: % scraping job(s) reset from running to idle', n;
END $$;

-- Guard against the regression the last patch missed: no dead credential path.
DO $verify$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_scraping_jobs';
  IF src LIKE '%Bearer eyJ%' OR src LIKE '%vault.get_secret%' OR src LIKE '%status = ''running''%' THEN
    RAISE EXCEPTION 'run_scraping_jobs still carries a dead credential or a status flip';
  END IF;
END
$verify$;
