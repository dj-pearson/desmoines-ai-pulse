-- AOS-MAINT-006: external-API cost & quota watchdog. Attributes ledger cost to a
-- provider, aggregates month-to-date spend per provider (ledger + optional
-- provider-reported usage), and compares against configured budgets. Soft breach
-- → throttle + alert; hard breach → pause the affected agents (reversible).
-- Additive only.

-- Attribute each agent's ledger cost to an external provider.
ALTER TABLE public.agent_registry
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'anthropic';

COMMENT ON COLUMN public.agent_registry.provider IS
  'External API provider whose spend this agent draws on (AOS-MAINT-006): anthropic | openai | google | stripe | resend.';

-- Per-provider budget + throttle/pause state.
CREATE TABLE IF NOT EXISTS public.provider_budgets (
  provider TEXT PRIMARY KEY,
  monthly_budget_usd NUMERIC NOT NULL DEFAULT 0, -- <= 0 means unmonitored
  soft_pct NUMERIC NOT NULL DEFAULT 0.80,
  hard_pct NUMERIC NOT NULL DEFAULT 1.00,
  throttled BOOLEAN NOT NULL DEFAULT false,
  paused BOOLEAN NOT NULL DEFAULT false,
  -- Agents this watchdog auto-paused on a hard breach (for clean auto-recovery).
  auto_paused_agents TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional provider-reported usage (for providers with no ledger signal).
CREATE TABLE IF NOT EXISTS public.provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT current_date,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_date ON public.provider_usage (provider, usage_date DESC);

ALTER TABLE public.provider_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "provider_budgets_admin_read"
    ON public.provider_budgets FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_usage_admin_read"
    ON public.provider_usage FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed default budgets (0 = unmonitored until an owner sets a real budget).
INSERT INTO public.provider_budgets (provider, monthly_budget_usd) VALUES
  ('anthropic', 100),
  ('openai', 50),
  ('google', 50),
  ('resend', 20),
  ('stripe', 0)
ON CONFLICT (provider) DO NOTHING;

-- Month-to-date spend per provider vs budget (ledger + reported).
CREATE OR REPLACE VIEW public.provider_spend_mtd AS
WITH ledger AS (
  SELECT ar.provider,
         COALESCE(sum(r.cost_usd) FILTER (WHERE r.started_at >= date_trunc('month', now())), 0) AS cost
  FROM public.agent_registry ar
  LEFT JOIN public.automation_job_runs r ON r.agent_key = ar.agent_key
  GROUP BY ar.provider
), reported AS (
  SELECT provider,
         COALESCE(sum(cost_usd) FILTER (WHERE usage_date >= date_trunc('month', now())::date), 0) AS cost
  FROM public.provider_usage
  GROUP BY provider
)
SELECT b.provider,
       b.monthly_budget_usd,
       b.soft_pct,
       b.hard_pct,
       b.throttled,
       b.paused,
       COALESCE(l.cost, 0) + COALESCE(rp.cost, 0) AS spend_mtd
FROM public.provider_budgets b
LEFT JOIN ledger l ON l.provider = b.provider
LEFT JOIN reported rp ON rp.provider = b.provider;

COMMENT ON VIEW public.provider_spend_mtd IS
  'Per-provider month-to-date external-API spend vs budget (AOS-MAINT-006). Ledger cost (agent_registry.provider) + provider_usage.';

-- Register the watchdog, scheduled hourly.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('api-cost-watchdog', 'API Cost Watchdog', 'maintain',
   'Aggregates month-to-date external-API spend per provider (ledger + reported usage) vs budgets; soft breach throttles + alerts, hard breach pauses the affected agents (reversible, auto-recovers when spend drops). Cost tile on /admin/agents (AOS-MAINT-006).',
   '0 * * * *', true, 0.95, NULL, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('api-cost-watchdog')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'api-cost-watchdog');
    PERFORM cron.schedule(
      'api-cost-watchdog',
      '0 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-api-watchdog',
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
