-- WEB-PERF-007: real-user web-vitals (RUM) collection + weekly regression check.
-- Additive: new table, anon may INSERT sampled anonymous metrics (no read),
-- admins/service may read for the trend panel + regression job.

CREATE TABLE IF NOT EXISTS public.web_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,            -- LCP | CLS | INP | TTFB
  value double precision NOT NULL,
  rating text,                     -- good | needs-improvement | poor
  page_group text NOT NULL,        -- home | events | event-detail | restaurants | ...
  session_id text,                 -- anonymous per-session id (not a user id)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_vitals_metric_page_created
  ON public.web_vitals (metric, page_group, created_at);

ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

-- Anyone (anon/auth) may submit a metric; nobody reads it back via the anon key.
DROP POLICY IF EXISTS "web_vitals_insert_any" ON public.web_vitals;
CREATE POLICY "web_vitals_insert_any" ON public.web_vitals
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Admins may read for the dashboard panel (service role bypasses RLS for the job).
DROP POLICY IF EXISTS "web_vitals_admin_read" ON public.web_vitals;
CREATE POLICY "web_vitals_admin_read" ON public.web_vitals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'root_admin')
    )
  );

-- Weekly regression check (Mondays 04:00 UTC) via the WEB-AUTO-001 jobRunner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('web-vitals-regression-check')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'web-vitals-regression-check');

    PERFORM cron.schedule(
      'web-vitals-regression-check',
      '0 4 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/web-vitals-regression-check',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        )
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
