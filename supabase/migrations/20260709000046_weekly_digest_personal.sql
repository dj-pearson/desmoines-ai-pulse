-- AOS-NURTURE-004: personalized weekly digest agent. Registers the agent; sends
-- go through the shared nurture_sends ledger (no new tables). Tier-aware,
-- frequency-capped, unsubscribe-respecting, quality-checked; empty digests are
-- skipped rather than sent as filler. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('weekly-digest-personal', 'Personalized Weekly Digest', 'nurture',
   'Assembles a per-user weekly digest (interest-matched upcoming events, new restaurants/attractions, saved-search matches) using existing content, tier-gated (some premium picks gated), frequency-capped, unsubscribe-respecting, and quality-checked; skips users with no relevant content (AOS-NURTURE-004).',
   '0 15 * * 4', true, 0.90, 30.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('weekly-digest-personal')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-digest-personal');
    PERFORM cron.schedule(
      'weekly-digest-personal',
      '0 15 * * 4',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-weekly-digest',
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
