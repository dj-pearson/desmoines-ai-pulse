-- AOS-MAINT-005: broken-link & dead-content monitor. Tracks per-link health in
-- content_link_checks (one upserted row per link). The monitor unpublishes past
-- events (reversible: sets events.archived_at) and marks hard-dead links tier-1;
-- ambiguous cases (redirect-to-different-host, possibly-recurring event)
-- escalate to tier-2. Additive only; all auto-actions are audited + reversible.

CREATE TABLE IF NOT EXISTS public.content_link_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table TEXT NOT NULL,
  row_id UUID NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER,
  ok BOOLEAN NOT NULL DEFAULT true,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  marked_dead BOOLEAN NOT NULL DEFAULT false,
  first_failed_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_table, row_id, url)
);

CREATE INDEX IF NOT EXISTS idx_link_checks_state ON public.content_link_checks (marked_dead, ok, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_link_checks_failing ON public.content_link_checks (consecutive_failures) WHERE consecutive_failures > 0;

ALTER TABLE public.content_link_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "link_checks_admin_read"
    ON public.content_link_checks FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.content_link_checks IS
  'Per-link health tracker (AOS-MAINT-005). Written by agent-link-monitor; a link dead N consecutive checks is marked_dead (tier-1). Marks are reversible — the content row is never mutated.';

-- Register the link/content monitor, scheduled daily at 09:00 UTC.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('link-content-monitor', 'Link & Content Monitor', 'maintain',
   'Crawls outbound content links and detects expired events; unpublishes past events (reversible archived_at) and marks hard-dead links tier-1, escalates ambiguous cases (redirect-to-different-host, possibly-recurring event) to tier-2. All auto-actions audited + reversible (AOS-MAINT-005).',
   '0 9 * * *', true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('link-content-monitor')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'link-content-monitor');
    PERFORM cron.schedule(
      'link-content-monitor',
      '0 9 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-link-monitor',
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
