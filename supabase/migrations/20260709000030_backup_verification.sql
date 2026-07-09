-- AOS-MAINT-003: backup verification. The backup-verifier agent records each
-- verification (backup recency via the Supabase Management API when configured,
-- plus a read-only row-count restore-sanity spot check) here and to the ledger.
-- Missing/stale backups open a tier-3 incident. Additive only.

CREATE TABLE IF NOT EXISTS public.backup_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- management_api = physical backup recency; row_spotcheck = data-presence proxy.
  method TEXT NOT NULL DEFAULT 'row_spotcheck',
  ok BOOLEAN NOT NULL,
  latest_backup_at TIMESTAMPTZ,
  backup_age_hours NUMERIC,
  -- Row counts of core tables at check time (restore-sanity proxy).
  row_counts JSONB,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_backup_checks_checked ON public.backup_checks (checked_at DESC);

ALTER TABLE public.backup_checks ENABLE ROW LEVEL SECURITY;

-- Admin read-only; the service role (edge function) writes, bypassing RLS.
DO $$ BEGIN
  CREATE POLICY "backup_checks_admin_read"
    ON public.backup_checks FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.backup_checks IS
  'Backup-verification results (AOS-MAINT-003). Written by the agent-backup-verify edge function; surfaced in the digest.';

-- Register the backup-verifier agent, scheduled daily at 06:30 UTC.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('backup-verifier', 'Backup Verifier', 'maintain',
   'Verifies Supabase backup recency (Management API when configured) and records a read-only row-count restore-sanity spot check to the ledger + backup_checks; missing/stale backups open a tier-3 incident immediately (AOS-MAINT-003).',
   '30 6 * * *', true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('backup-verifier')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backup-verifier');
    PERFORM cron.schedule(
      'backup-verifier',
      '30 6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-backup-verify',
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
