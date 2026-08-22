-- Expose pg_cron outcomes so a check can see them (WEB-OPS-007).
--
-- WHY THIS DOES NOT ALREADY EXIST, given WEB-AUTO-001 shipped "cron/job
-- observability, auto-retry, failure alerts": that story built observability
-- over automation_job_runs, a table the EDGE FUNCTIONS write when they run. If
-- the function is never invoked it writes no row, so an agent that never fires
-- looks identical to an agent with nothing to do. The scheduler's own verdict
-- lives in cron.job_run_details, which is in a schema PostgREST cannot reach
-- and which nothing has ever queried.
--
-- Measured on production 2026-08-22, over the whole retained history:
--   84,718 succeeded, 171,633 failed, oldest row 2025-07-30
--   57 of 61 jobs have NEVER succeeded, not once
-- The four that work (auto-trigger-scraping-jobs, scraping-jobs-runner,
-- social-media-publishing, generate-recurring-event-instances) are the four
-- that call a plain SQL function. Every job that posts to an edge function has
-- failed on every run since it was created.
--
-- SECURITY DEFINER because cron.* is owned by supabase_admin and not readable
-- by the API roles. It returns COUNTS AND JOB NAMES ONLY -- never `command`,
-- which embeds current_setting('app.settings.service_role_key') and would
-- publish the shape of the credential lookup.
CREATE OR REPLACE FUNCTION public.cron_health(window_hours integer DEFAULT 24)
RETURNS TABLE (
  jobname        text,
  schedule       text,
  active         boolean,
  runs           bigint,
  succeeded      bigint,
  failed         bigint,
  last_success   timestamptz,
  last_failure   timestamptz,
  last_error     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $$
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    count(r.runid)                                          AS runs,
    count(r.runid) FILTER (WHERE r.status = 'succeeded')     AS succeeded,
    count(r.runid) FILTER (WHERE r.status = 'failed')        AS failed,
    max(r.start_time) FILTER (WHERE r.status = 'succeeded')  AS last_success,
    max(r.start_time) FILTER (WHERE r.status = 'failed')     AS last_failure,
    -- Truncated: some messages echo the failing statement back.
    left(
      (array_agg(r.return_message ORDER BY r.start_time DESC)
        FILTER (WHERE r.status = 'failed'))[1],
      200
    )                                                        AS last_error
  FROM cron.job j
  LEFT JOIN cron.job_run_details r
    ON r.jobid = j.jobid
   AND r.start_time > now() - make_interval(hours => window_hours)
  GROUP BY j.jobname, j.schedule, j.active
  ORDER BY failed DESC, j.jobname;
$$;

REVOKE ALL ON FUNCTION public.cron_health(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_health(integer) TO service_role;

COMMENT ON FUNCTION public.cron_health(integer) IS
  'Per-job pg_cron outcomes over the last N hours. service_role only; counts and job names, never the command text. WEB-OPS-007.';
