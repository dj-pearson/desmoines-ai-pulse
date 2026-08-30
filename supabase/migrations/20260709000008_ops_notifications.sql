-- AOS-CORE-010: ops notification log — backs frequency-capping / coalescing so a
-- storm of tasks does not create a storm of emails. One row per (dedupe_key)
-- burst; repeats within the cap window bump suppressed_count instead of sending.
-- Additive only.

CREATE TABLE IF NOT EXISTS public.ops_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT,
  channels TEXT[] NOT NULL DEFAULT '{}',
  suppressed_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest send per dedupe_key drives the cap-window lookup.
CREATE INDEX IF NOT EXISTS idx_ops_notification_dedupe_sent
  ON public.ops_notification_log (dedupe_key, last_sent_at DESC);

ALTER TABLE public.ops_notification_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ops_notification_admin_read"
    ON public.ops_notification_log FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.ops_notification_log IS
  'Coalescing/frequency-cap state for notifyOps (AOS-CORE-010). Written by the service role; admin-read only.';

-- Register the ops digest as a governance agent + schedule it daily (13:00 UTC).
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role)
VALUES
  ('ops-digest', 'Ops Digest', 'governance',
   'Daily digest of tier-1 auto-resolutions, open-task counts, and agent failures to ops (AOS-CORE-010).',
   '0 13 * * *', true, 0.95, NULL, 'admin')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ops-digest-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops-digest-daily');

    PERFORM cron.schedule(
      'ops-digest-daily',
      '0 13 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-ops-digest',
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
