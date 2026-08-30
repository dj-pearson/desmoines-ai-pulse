-- AOS-SEC-001: register the security anomaly-detection agent and schedule it.
-- It only READS security signals and OPENS incident tasks (no destructive
-- action, never locks a user), so it ships live. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('security-anomaly-detector', 'Security Anomaly Detector', 'security',
   'Watches login_attempts, rate_limit_entries, and security_audit_logs for credential-stuffing, quota-abuse, and unusual-admin-action spikes; opens incident tasks with evidence (AOS-SEC-001).',
   '*/15 * * * *', true, 0.95, NULL, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('security-anomaly-detector')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'security-anomaly-detector');

    PERFORM cron.schedule(
      'security-anomaly-detector',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-security-monitor',
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
