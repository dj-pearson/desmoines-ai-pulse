-- The WEB-ADS-003 pricing trigger calls an overload that no longer exists.
--
-- 20260902000008 wrote enforce_campaign_placement_pricing() against
-- calculate_campaign_pricing(text, integer), the overload 20260227000000
-- created. 20260822000004 had already dropped that one (:148) to end the
-- PGRST203 ambiguity, leaving calculate_campaign_pricing(placement_type,
-- integer) as the only candidate. There is no implicit cast from text back to
-- an enum, so `NEW.placement_type::text` resolves to nothing and every
-- non-admin insert into campaign_placements fails with 42883 the moment
-- 20260902000008 is applied. That is every advertiser checkout.
--
-- The fix is the one argument: campaign_placements.placement_type is already
-- the placement_type enum, so it is passed as it is. Everything else in the
-- body is 20260902000008's, unchanged, so the trigger it installed
-- (trg_campaign_placement_pricing) picks this up without being re-created.
--
-- Apply in the same push as 20260902000008 if that one is not applied yet
-- (business plan D1). On its own this migration only replaces a function body.
--
-- Additive: CREATE OR REPLACE with the same signature and return type.

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

  -- days_count is derived from the dates, in ONE place.
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

  -- The surviving overload takes the enum. No cast: see the header.
  SELECT * INTO v_price
    FROM public.calculate_campaign_pricing(NEW.placement_type, NEW.days_count);

  IF v_price.total_price IS NULL THEN
    RAISE EXCEPTION 'no price for placement %', NEW.placement_type
      USING ERRCODE = '22023';
  END IF;

  NEW.daily_cost := v_price.daily_price;
  NEW.total_cost := v_price.total_price;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_campaign_placement_pricing() IS
'WEB-ADS-003. Overwrites daily_cost, total_cost and days_count on any client-originated write to campaign_placements with the rate-card price for the campaign dates, via calculate_campaign_pricing(placement_type, integer). The service role and admins are exempt.';
