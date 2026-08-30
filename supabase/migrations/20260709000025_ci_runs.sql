-- AOS-DEV-005: CI run history for the flaky-test / CI-health watcher. A
-- workflow_run-triggered job records each test workflow's outcome here; the
-- watcher analyzes trends + flakiness. Additive only.

CREATE TABLE IF NOT EXISTS public.ci_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow TEXT NOT NULL,
  conclusion TEXT NOT NULL,        -- success | failure | cancelled | ...
  duration_s INTEGER,
  branch TEXT,
  head_sha TEXT,
  run_id TEXT,
  flaky_count INTEGER NOT NULL DEFAULT 0, -- Playwright-reported flakes if provided
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ci_runs_workflow_created ON public.ci_runs (workflow, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ci_runs_created ON public.ci_runs (created_at DESC);

ALTER TABLE public.ci_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ci_runs_admin_read"
    ON public.ci_runs FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.ci_runs IS
  'Per-workflow CI run outcomes (AOS-DEV-005). Written by the ci-health-report workflow; admin read.';

-- Register the CI-health watcher + schedule the analysis every 6 hours.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('ci-health-watcher', 'CI Health Watcher', 'dev',
   'Analyzes ci_runs for flaky (non-deterministic) test workflows and duration/failure-rate regressions; opens tier-2 fix tasks and raises ops alerts (AOS-DEV-005).',
   '20 */6 * * *', true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ci-health-watcher')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ci-health-watcher');
    PERFORM cron.schedule(
      'ci-health-watcher',
      '20 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-ci-health',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := '{"mode":"analyze"}'::jsonb
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
