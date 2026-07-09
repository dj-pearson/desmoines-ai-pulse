-- AOS-MAINT-001: uptime / synthetic-monitoring sink. The uptime-monitor agent
-- probes critical public routes and edge-function health (non-mutating) every
-- 5 min and records latency/status here. Sustained failures open a tier-2
-- incident; the /admin/agents status tile reads current up/down + p95 from this
-- table. Additive only.

CREATE TABLE IF NOT EXISTS public.uptime_probes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_key TEXT NOT NULL,            -- stable id, e.g. 'route:/events' or 'fn:agent-ops-digest'
  target_kind TEXT NOT NULL DEFAULT 'route', -- route | function
  url TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uptime_probes_target_checked
  ON public.uptime_probes (target_key, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_probes_checked
  ON public.uptime_probes (checked_at DESC);

ALTER TABLE public.uptime_probes ENABLE ROW LEVEL SECURITY;

-- Admin read-only; the service role (edge function) writes, bypassing RLS.
DO $$ BEGIN
  CREATE POLICY "uptime_probes_admin_read"
    ON public.uptime_probes FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.uptime_probes IS
  'Synthetic-monitoring probe results (AOS-MAINT-001). Written by the agent-uptime-monitor edge function; read by the /admin/agents status tile.';

-- Register the uptime-monitor agent, scheduled every 5 minutes.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('uptime-monitor', 'Uptime Monitor', 'maintain',
   'Probes critical public routes and edge-function health (non-mutating) every 5 min, records latency/status; opens a tier-2 incident on sustained failure (3 consecutive) and resolves it on recovery (AOS-MAINT-001).',
   '*/5 * * * *', true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('uptime-monitor')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'uptime-monitor');
    PERFORM cron.schedule(
      'uptime-monitor',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-uptime-monitor',
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
