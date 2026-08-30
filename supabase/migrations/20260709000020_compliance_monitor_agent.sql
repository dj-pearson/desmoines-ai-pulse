-- AOS-SEC-007: register the compliance monitor and schedule it weekly. Reads
-- deletion/consent/retention state and opens review tasks; NEVER hard-deletes
-- (retention purges are approval-gated), so it ships live. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('compliance-monitor', 'Compliance Monitor', 'governance',
   'Tracks GDPR/CCPA deletion SLAs, data-retention windows, and consent coverage; overdue/over-policy items open tier-2 review tasks (never hard-deletes) (AOS-SEC-007).',
   '0 6 * * 1', true, 0.95, NULL, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('compliance-monitor')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compliance-monitor');

    PERFORM cron.schedule(
      'compliance-monitor',
      '0 6 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-compliance-monitor',
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
