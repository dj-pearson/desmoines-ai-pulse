-- AOS-MAINT-004: data-quality sweeper. Tracks content rows missing image_url,
-- coordinates, or SEO/GEO fields; the sweeper auto-fills via existing backfill /
-- geocode / generate-seo functions (tier-1) and escalates rows that stay broken
-- after N attempts to a tier-2 data task. Snapshots fill-rate for the digest
-- trend. Additive only.

-- Per-row issue tracker (idempotent by (target_table, row_id)).
CREATE TABLE IF NOT EXISTS public.data_quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table TEXT NOT NULL,
  row_id UUID NOT NULL,
  missing_fields TEXT[] NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open | escalated | resolved
  last_error TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  UNIQUE (target_table, row_id)
);

CREATE INDEX IF NOT EXISTS idx_dq_issues_status ON public.data_quality_issues (status, target_table);

-- Fill-rate snapshots for the digest trend.
CREATE TABLE IF NOT EXISTS public.data_quality_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_name TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  missing_image INTEGER NOT NULL DEFAULT 0,
  missing_coords INTEGER NOT NULL DEFAULT 0,
  missing_seo INTEGER NOT NULL DEFAULT 0,
  missing_geo INTEGER NOT NULL DEFAULT 0,
  fill_rate NUMERIC NOT NULL DEFAULT 0 -- share of rows with all four groups present
);

CREATE INDEX IF NOT EXISTS idx_dq_snapshots_captured ON public.data_quality_snapshots (captured_at DESC);

ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dq_issues_admin_read"
    ON public.data_quality_issues FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dq_snapshots_admin_read"
    ON public.data_quality_snapshots FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.data_quality_issues IS
  'Per-row content-gap tracker (AOS-MAINT-004). Written by agent-data-quality; rows escalate to tier-2 after N failed autofill attempts.';
COMMENT ON TABLE public.data_quality_snapshots IS
  'Fill-rate snapshots for the data-quality digest trend (AOS-MAINT-004).';

-- Register the data-quality sweeper, scheduled daily at 08:00 UTC.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('data-quality-sweeper', 'Data Quality Sweeper', 'maintain',
   'Finds events/restaurants/attractions missing image_url, coordinates, or SEO/GEO fields and auto-fills via existing backfill/geocode/generate-seo functions (tier-1, bounded + rate-limited); escalates rows still broken after N attempts to a tier-2 data task; snapshots fill-rate trend (AOS-MAINT-004).',
   '0 8 * * *', true, 0.90, 20.00, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('data-quality-sweeper')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'data-quality-sweeper');
    PERFORM cron.schedule(
      'data-quality-sweeper',
      '0 8 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-data-quality',
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
