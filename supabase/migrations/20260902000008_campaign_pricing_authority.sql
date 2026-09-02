-- WEB-ADS-003: the browser decided what to charge.
--
-- useCampaigns.createCampaign inserted daily_cost, days_count and total_cost
-- into campaign_placements straight from the client, and
-- create-campaign-checkout built Stripe's line items from
-- placement.total_cost. campaign_placements has no RLS policy in any migration
-- (the table was created outside the ledger; 20260401000001 only adds columns),
-- so anyone could PATCH total_cost to 0.01 between creating a campaign and
-- opening checkout and Stripe would be asked for a cent.
--
-- THE FIX IS A TRIGGER, NOT A POLICY, and that is deliberate.
--
-- The story asks for column-level RLS stopping non-admins writing daily_cost,
-- total_cost and days_count. Postgres has no column-level RLS, so that means a
-- trigger anyway -- and a trigger can do better than refusing. This one
-- RECOMPUTES: whatever the browser sends for those three columns is discarded
-- and replaced with what calculate_campaign_pricing() says, from the rate card,
-- for the dates on the campaign. The client cannot set a price wrongly because
-- it cannot set a price at all.
--
-- WHY THIS MIGRATION DOES NOT ADD RLS POLICIES. campaign_placements' current
-- policies are not in the ledger and cannot be read from here, so writing them
-- blind has two bad outcomes: duplicating policies that already exist under
-- other names, or -- if RLS turns out to be disabled on this table -- enabling
-- it and denying access that works today. The trigger reaches the story's
-- actual goal (a non-admin may not influence daily_cost, total_cost or
-- days_count) under every one of those states, because a BEFORE trigger runs
-- whatever the policies say. Getting the table's real policies into the ledger
-- belongs with the schema-drift work, not with a pricing fix.
--
-- Additive: new functions and triggers, one seeded rate-card row. No column,
-- type or policy changes. Shipped mobile binaries do not create campaigns.

-- ---------------------------------------------------------------------------
-- 1. sponsored_listing had no rate-card row, so useCampaigns priced it with a
--    hardcoded 15 and a comment saying so. Seed it and the flat rate becomes a
--    rate like any other, editable in AdRateManager.
-- ---------------------------------------------------------------------------
INSERT INTO public.ad_rate_card (placement_type, base_daily_rate, is_active)
SELECT 'sponsored_listing', 15.00, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ad_rate_card WHERE placement_type = 'sponsored_listing'
);

-- ---------------------------------------------------------------------------
-- 2. The price of a placement is computed here or not at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_campaign_placement_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end   date;
  v_days  integer;
  v_price record;
BEGIN
  -- Edge functions (service role) and admins set prices deliberately: the
  -- checkout function writes back the authoritative amount, and AdRateManager
  -- is how a human overrides one. Everyone else is priced by the rate card.
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT c.start_date::date, c.end_date::date
    INTO v_start, v_end
    FROM public.campaigns c
   WHERE c.id = NEW.campaign_id;

  -- days_count is derived from the dates, in ONE place. It used to be an
  -- independent number defaulting to 7 while the campaign carried whatever
  -- dates the user picked, and get_active_ads serves on the dates -- so a
  -- 30-day campaign could be paid for as seven.
  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    v_days := (v_end - v_start) + 1;
    IF v_days < 1 THEN
      RAISE EXCEPTION 'campaign % ends before it starts', NEW.campaign_id
        USING ERRCODE = '22023';
    END IF;
    NEW.days_count := v_days;
  ELSE
    NEW.days_count := GREATEST(COALESCE(NEW.days_count, 1), 1);
  END IF;

  SELECT * INTO v_price
    FROM public.calculate_campaign_pricing(NEW.placement_type::text, NEW.days_count);

  IF v_price.total_price IS NULL THEN
    RAISE EXCEPTION 'no price for placement %', NEW.placement_type
      USING ERRCODE = '22023';
  END IF;

  NEW.daily_cost := v_price.daily_price;
  NEW.total_cost := v_price.total_price;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_placement_pricing ON public.campaign_placements;
CREATE TRIGGER trg_campaign_placement_pricing
  BEFORE INSERT OR UPDATE ON public.campaign_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_placement_pricing();

COMMENT ON FUNCTION public.enforce_campaign_placement_pricing() IS
'WEB-ADS-003. Overwrites daily_cost, total_cost and days_count on any client-originated write to campaign_placements with the rate-card price for the campaign dates. The service role and admins are exempt. This is what makes the browser unable to set what Stripe is asked to charge.';

-- ---------------------------------------------------------------------------
-- 3. campaigns.total_cost follows its placements, so the two cannot disagree.
--    The displayed summary said $70 while the row said $66.50 because the page
--    totalled a static rate and the row came from the discounted RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_campaign_total_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign uuid := COALESCE(NEW.campaign_id, OLD.campaign_id);
BEGIN
  UPDATE public.campaigns c
     SET total_cost = (
           SELECT COALESCE(SUM(p.total_cost), 0)
             FROM public.campaign_placements p
            WHERE p.campaign_id = v_campaign
         ),
         updated_at = now()
   WHERE c.id = v_campaign;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_total_cost ON public.campaign_placements;
CREATE TRIGGER trg_campaign_total_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_campaign_total_cost();

-- ---------------------------------------------------------------------------
-- 4. Report what is already inconsistent, so the owner sees it once rather
--    than discovering it in a Stripe dispute.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_mismatched integer;
BEGIN
  SELECT count(*) INTO n_mismatched
    FROM public.campaigns c
   WHERE EXISTS (SELECT 1 FROM public.campaign_placements p WHERE p.campaign_id = c.id)
     AND COALESCE(c.total_cost, 0) <> (
           SELECT COALESCE(SUM(p.total_cost), 0)
             FROM public.campaign_placements p
            WHERE p.campaign_id = c.id
         );
  RAISE NOTICE 'WEB-ADS-003: % campaign(s) whose total_cost disagreed with their placements', n_mismatched;
END $$;
