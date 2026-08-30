-- AOS-MAINT-007: edge-function error-rate & cold-start monitor. Instrumented
-- functions (via _shared/instrument.ts) record per-invocation samples here; the
-- monitor aggregates these plus the ledger (automation_job_runs) to detect
-- error-rate / latency regressions and opens tier-2 tasks. Additive only.

CREATE TABLE IF NOT EXISTS public.edge_function_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  method TEXT,
  status_code INTEGER,
  status_class TEXT,          -- 2xx | 3xx | 4xx | 5xx | other
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_metrics_fn_created ON public.edge_function_metrics (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_metrics_created ON public.edge_function_metrics (created_at DESC);

ALTER TABLE public.edge_function_metrics ENABLE ROW LEVEL SECURITY;

-- Admin read-only; service role (instrument helper) writes, bypassing RLS.
DO $$ BEGIN
  CREATE POLICY "edge_metrics_admin_read"
    ON public.edge_function_metrics FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.edge_function_metrics IS
  'Per-invocation edge-function samples (AOS-MAINT-007): status class (4xx vs 5xx) + latency. Written by _shared/instrument.ts; aggregated by agent-edge-metrics.';

-- Register the edge-metrics monitor, scheduled every 6 hours.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('edge-metrics-monitor', 'Edge Metrics Monitor', 'maintain',
   'Aggregates edge_function_metrics (instrumented HTTP 4xx/5xx + latency) and the ledger to compute per-function error rate, p95 latency, and cold-start proxy vs a prior-window baseline; opens tier-2 tasks on server-side (5xx/failure) regressions — 4xx is noted, not alerted. Surfaces noisiest functions in the digest (AOS-MAINT-007).',
   '0 */6 * * *', true, 0.90, NULL, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('edge-metrics-monitor')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'edge-metrics-monitor');
    PERFORM cron.schedule(
      'edge-metrics-monitor',
      '0 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-edge-metrics',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
