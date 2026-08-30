-- AOS-PROSPECT-005: proposal / media-kit generator. A configured ad price list
-- (the agent NEVER invents prices) and a proposals table attached to
-- opportunities. Additive only.

CREATE TABLE IF NOT EXISTS public.ad_price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  tier TEXT,                          -- starter | growth | premium
  price NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'month',  -- month | campaign | week
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  content JSONB,                      -- audience stats + placements + pricing tiers used
  html TEXT,                          -- shareable doc draft
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | accepted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposals_opportunity ON public.proposals (opportunity_id, created_at DESC);

ALTER TABLE public.ad_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ad_price_list_sales" ON public.ad_price_list FOR ALL TO authenticated USING (public.is_admin_or_sales()) WITH CHECK (public.is_admin_or_sales());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "proposals_sales" ON public.proposals FOR ALL TO authenticated USING (public.is_admin_or_sales()) WITH CHECK (public.is_admin_or_sales());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed a real price list (the ONLY source of prices for proposals).
INSERT INTO public.ad_price_list (product_key, name, description, tier, price, unit, sort_order) VALUES
  ('featured_listing', 'Featured Listing', 'Priority placement in your category with a highlighted card.', 'starter', 149, 'month', 1),
  ('newsletter_feature', 'Newsletter Feature', 'A dedicated spot in the weekly Des Moines Insider newsletter.', 'growth', 299, 'campaign', 2),
  ('homepage_banner', 'Homepage Banner', 'Rotating banner placement on the homepage.', 'growth', 499, 'month', 3),
  ('event_promotion', 'Event Promotion', 'Boosted promotion for a specific event across the platform.', 'starter', 199, 'campaign', 4),
  ('premium_partner', 'Premium Partner Package', 'Featured listing + newsletter + homepage banner bundled.', 'premium', 799, 'month', 5)
ON CONFLICT (product_key) DO NOTHING;

COMMENT ON TABLE public.ad_price_list IS
  'Configured ad products + prices (AOS-PROSPECT-005). The proposal generator pulls prices ONLY from here — it never invents prices.';
COMMENT ON TABLE public.proposals IS
  'Generated advertiser proposals/media-kits (AOS-PROSPECT-005), attached to an opportunity, draft-for-human-review by default.';

-- Register the proposal generator (on-demand, invoked from the CRM console).
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('proposal-generator', 'Proposal Generator', 'prospect',
   'Generates a tailored proposal/media-kit (real audience stats, placement options, pricing tiers from ad_price_list) for an opportunity as a shareable doc draft; never invents prices, draft-for-human-review, attached to the opportunity + audited (AOS-PROSPECT-005).',
   NULL, true, 0.90, 15.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;
