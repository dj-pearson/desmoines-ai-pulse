-- WEB-SEC-075: anon and signed-in users can read the ad rate card, but not
-- updated_by (the auth.users id of the admin who last changed a price).
--
-- WHAT WAS WRONG. ad_rate_card's "Public can read rate card" policy is
-- USING (true) with no TO clause (20260227000000), and it has to stay: the
-- /advertise page quotes advertisers from it. But every row carries
-- updated_by UUID REFERENCES auth.users, written by AdRateManager on each save:
--
--     GET /rest/v1/ad_rate_card?select=placement_type,updated_by
--
-- A row policy cannot hide one column, so this uses column privileges: the
-- table-level SELECT grant is taken from anon and authenticated and SELECT is
-- granted back on every column except updated_by. The policy is untouched.
--
-- TRAP: the table-level REVOKE is the part that does the work. A column-level
-- REVOKE SELECT (updated_by) on its own is a no-op while the role still holds
-- SELECT on the whole table (Postgres checks the table grant first), which is
-- what 20260413000002 and 20260918000002 did for newsletter_subscribers'
-- tokens; RLS is what actually protects those.
--
-- TRAP FOR THE NEXT COLUMN: a column added to ad_rate_card after this is NOT
-- readable by anon or authenticated until it is added to the GRANT below, and
-- a client that names it gets 42501. Grant it in the same migration.
--
-- READERS enumerated on 2026-11-15:
--   web      fetchRateCard (src/hooks/useCampaigns.ts) names six granted
--            columns. AdRateManager (admin) read select('*'), which a
--            column grant refuses with 42501, so it now names its columns
--            in the same commit; it never displayed updated_by. Its UPDATE
--            sends no return=representation, so it needs SELECT only on id
--            (the WHERE), and UPDATE stays a table-level grant.
--   iOS      no reference under ios/.
--   Android  no reference under android/.
--   edge     none read the table; create-campaign-checkout prices through
--            calculate_campaign_pricing().
--   SQL      enforce_campaign_placement_pricing() is SECURITY DEFINER, so the
--            column grant does not reach it. calculate_campaign_pricing() is
--            also called from the browser (useCampaignQuote); the guard at the
--            bottom calls it as anon and aborts this migration if the column
--            grant breaks it, rather than shipping broken quotes.
-- DEPLOY ORDER: deploy the web bundle first. An admin on the old bundle gets
-- an error loading the rate-card editor until then; no advertiser path
-- changes. service_role keeps the full table.

REVOKE SELECT ON public.ad_rate_card FROM anon, authenticated;

GRANT SELECT (
  id,
  placement_type,
  base_daily_rate,
  cpm_rate,
  min_days,
  max_days,
  min_lead_time_days,
  discount_7_day,
  discount_14_day,
  discount_30_day,
  peak_multiplier,
  high_multiplier,
  is_active,
  created_at,
  updated_at
) ON public.ad_rate_card TO anon, authenticated;

COMMENT ON COLUMN public.ad_rate_card.updated_by IS
  'WEB-SEC-075: not granted to anon or authenticated (column privileges, 20261115000102). Read it with the service role.';

-- Guard: calculate_campaign_pricing() must still answer as anon. Its live
-- definition is not in this repo (20260822000004 dropped the text overload
-- and left the placement_type one), so it is exercised rather than assumed.
-- An invoker function that read SELECT * FROM ad_rate_card would now fail
-- with 42501; abort instead of shipping that.
DO $$
DECLARE
  v_can_switch BOOLEAN := true;
BEGIN
  IF to_regprocedure('public.calculate_campaign_pricing(public.placement_type, integer)') IS NULL THEN
    RAISE NOTICE 'WEB-SEC-075: calculate_campaign_pricing(placement_type, integer) is absent; guard skipped';
    RETURN;
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
  EXCEPTION WHEN insufficient_privilege THEN
    v_can_switch := false;
  END;
  IF NOT v_can_switch THEN
    RAISE NOTICE 'WEB-SEC-075: this role cannot SET ROLE anon; guard skipped';
    RETURN;
  END IF;

  BEGIN
    PERFORM * FROM public.calculate_campaign_pricing('top_banner'::public.placement_type, 7);
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE EXCEPTION 'WEB-SEC-075: calculate_campaign_pricing() is refused as anon after the ad_rate_card column grant (%). Make it SECURITY DEFINER or have it name its columns, then re-run.', SQLERRM;
    WHEN OTHERS THEN
      RAISE NOTICE 'WEB-SEC-075: calculate_campaign_pricing() raised % (not a privilege error); guard does not judge it', SQLERRM;
  END;
  RESET ROLE;
END;
$$;
