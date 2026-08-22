-- Make cron_health() affordable over PostgREST (WEB-OPS-007).
--
-- 20260822000008 aggregated cron.job_run_details directly. That works from psql
-- (2.1s) and times out through the API: the table is 188 MB / 256,381 rows, its
-- only index is on runid, and nothing indexes start_time -- so a 24h window is a
-- full scan every call. The API request died on
--   57014  canceling statement due to statement timeout
-- against authenticator's statement_timeout=8s. Indexing the table is not
-- available to us: CREATE INDEX on cron.job_run_details returns "must be owner
-- of table job_run_details", and it belongs to supabase_admin.
--
-- So the scan moves to a background job and the API reads a snapshot.
--
-- THE SNAPSHOT JOB IS ITSELF A CRON JOB, which sounds circular given this story
-- is about cron jobs not running. It is not: it calls a plain SQL function and
-- makes no HTTP call, which is exactly what the four jobs that DO work have in
-- common (auto-trigger-scraping-jobs, scraping-jobs-runner,
-- social-media-publishing, generate-recurring-event-instances). Neither failure
-- mode -- the unset app.settings.* parameter, the pg_net signature mismatch --
-- can touch it.
--
-- And if it stops anyway, that is visible rather than silent: every row carries
-- captured_at, and scripts/check-cron-health.ts fails on a stale snapshot. A
-- monitor that cannot report its own absence is the exact defect this story is
-- about (see WEB-AUTO-001 in the story notes).
--
-- cron_health() loses its window_hours argument here. Normally that would be a
-- breaking change requiring the deprecation flow in CLAUDE.md, but the function
-- was created earlier the same day, is service_role-only, and has exactly one
-- caller in this repo, which is updated in the same commit.

CREATE TABLE IF NOT EXISTS public.cron_health_snapshot (
  jobname       text PRIMARY KEY,
  schedule      text        NOT NULL,
  active        boolean     NOT NULL,
  window_hours  integer     NOT NULL,
  runs          bigint      NOT NULL,
  succeeded     bigint      NOT NULL,
  failed        bigint      NOT NULL,
  last_success  timestamptz,
  last_failure  timestamptz,
  last_error    text,
  captured_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_health_snapshot ENABLE ROW LEVEL SECURITY;

-- No policy for anon or authenticated. last_error echoes failing statements
-- back, and service_role bypasses RLS, so the check still reads it.
DROP POLICY IF EXISTS "Admins can view cron health" ON public.cron_health_snapshot;
CREATE POLICY "Admins can view cron health"
  ON public.cron_health_snapshot
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

/**
 * Re-read cron.job_run_details and replace the snapshot. Plain SQL, no HTTP.
 */
CREATE OR REPLACE FUNCTION public.refresh_cron_health_snapshot(window_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  -- Rebuilt whole rather than upserted so a removed job disappears from the
  -- snapshot instead of lingering with stale counts forever.
  DELETE FROM public.cron_health_snapshot;

  INSERT INTO public.cron_health_snapshot (
    jobname, schedule, active, window_hours,
    runs, succeeded, failed, last_success, last_failure, last_error, captured_at
  )
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    window_hours,
    count(r.runid),
    count(r.runid) FILTER (WHERE r.status = 'succeeded'),
    count(r.runid) FILTER (WHERE r.status = 'failed'),
    max(r.start_time) FILTER (WHERE r.status = 'succeeded'),
    max(r.start_time) FILTER (WHERE r.status = 'failed'),
    left(
      (array_agg(r.return_message ORDER BY r.start_time DESC)
        FILTER (WHERE r.status = 'failed'))[1],
      200
    ),
    now()
  FROM cron.job j
  LEFT JOIN cron.job_run_details r
    ON r.jobid = j.jobid
   AND r.start_time > now() - make_interval(hours => window_hours)
  GROUP BY j.jobname, j.schedule, j.active;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_cron_health_snapshot(integer) FROM public, anon, authenticated;

-- cron_health() now reads the snapshot. Same columns plus captured_at and
-- window_hours, so a caller can tell fresh data from stale.
DROP FUNCTION IF EXISTS public.cron_health(integer);

CREATE OR REPLACE FUNCTION public.cron_health()
RETURNS TABLE (
  jobname       text,
  schedule      text,
  active        boolean,
  window_hours  integer,
  runs          bigint,
  succeeded     bigint,
  failed        bigint,
  last_success  timestamptz,
  last_failure  timestamptz,
  last_error    text,
  captured_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.jobname, s.schedule, s.active, s.window_hours,
         s.runs, s.succeeded, s.failed,
         s.last_success, s.last_failure, s.last_error, s.captured_at
  FROM public.cron_health_snapshot s
  ORDER BY s.failed DESC, s.jobname;
$$;

REVOKE ALL ON FUNCTION public.cron_health() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_health() TO service_role;

COMMENT ON FUNCTION public.cron_health() IS
  'Per-job pg_cron outcomes from the last snapshot. service_role only; counts and job names, never cron.job.command, which embeds the credential lookup. WEB-OPS-007.';

-- Every 30 minutes: often enough that a newly-broken job is caught the same
-- day, rare enough that a 2s scan of a 188 MB table is not a load concern.
SELECT cron.unschedule('cron-health-snapshot')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-health-snapshot');

SELECT cron.schedule(
  'cron-health-snapshot',
  '*/30 * * * *',
  $cron$SELECT public.refresh_cron_health_snapshot(24);$cron$
);

-- Populate immediately so the check has something to read before the first tick.
SELECT public.refresh_cron_health_snapshot(24);
