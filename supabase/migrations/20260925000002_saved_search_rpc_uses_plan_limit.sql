-- docs/page-plans/search.md WP5 item 7: one limit formula for saved searches.
--
-- Two checks guard a saved-search insert and they disagreed:
--   create_event_saved_search (20260623000003_saved_search_alerts.sql:57-74)
--     hardcoded Insider = 10 and VIP = unlimited, counted only 'active' and
--     'trialing' subscriptions, and counted only event_list rows;
--   trg_saved_searches_limit (20260918000001_enforce_plan_limits.sql:133-164)
--     reads entitled_plan_limit(user, 'saved_searches') - the plan row's own
--     number, including the 14-day past_due grace window - and counts every
--     row the user owns.
-- So a past_due Insider inside the grace window was refused by the RPC and
-- allowed by the trigger, and a user with iOS 'advanced' rows could pass the
-- RPC's count and then be refused by the trigger with a different error.
--
-- The RPC now asks the same function and counts the same rows as the trigger.
-- It keeps raising 'saved_search_limit_reached' (P0001), which is what
-- src/hooks/useSavedSearchAlerts.ts matches to show the upgrade path.
--
-- BACKWARD COMPATIBILITY. CREATE OR REPLACE with the same signature
-- (p_name TEXT, p_filters JSONB), the same return type (public.saved_searches)
-- and the same error code. No DROP, no parameter change. Depends on
-- entitled_plan_limit from 20260918000001, which must be applied first; the
-- timestamp order guarantees that on `supabase db push`.

CREATE OR REPLACE FUNCTION public.create_event_saved_search(
  p_name    TEXT,
  p_filters JSONB
)
RETURNS public.saved_searches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_limit  INTEGER;
  v_count  BIGINT;
  v_row    public.saved_searches;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- -1 is unlimited, the same convention the trigger uses.
  v_limit := public.entitled_plan_limit(v_user, 'saved_searches');

  IF v_limit >= 0 THEN
    SELECT count(*) INTO v_count
    FROM public.saved_searches
    WHERE user_id = v_user;

    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'saved_search_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.saved_searches (user_id, name, filters, search_type, alerts_enabled, use_count)
  VALUES (v_user, COALESCE(NULLIF(trim(p_name), ''), 'My saved search'), p_filters, 'event_list', true, 1)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- CREATE OR REPLACE keeps existing grants; restated so this file stands alone.
GRANT EXECUTE ON FUNCTION public.create_event_saved_search(TEXT, JSONB) TO authenticated;
