-- AOS-SEC-004: register the subscription/AI-endpoint abuse & fraud detector and
-- schedule it. It reads billing/usage and opens incident tasks; it takes no
-- account-affecting action itself (those escalate to a human), so it ships live.
-- Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('fraud-abuse-detector', 'Fraud & Abuse Detector', 'security',
   'Correlates payments (refunds/chargebacks), subscriptions (entitlement), and usage_events (AI quota) to flag rapid signup+refund, per-user quota abuse, and mismatched entitlements; escalates account-affecting responses to a human (AOS-SEC-004).',
   '0 */6 * * *', true, 0.95, NULL, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('fraud-abuse-detector')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fraud-abuse-detector');

    PERFORM cron.schedule(
      'fraud-abuse-detector',
      '0 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-fraud-monitor',
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
