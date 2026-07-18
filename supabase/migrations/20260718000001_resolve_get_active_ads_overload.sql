-- WEB-QA-003: resolve the ambiguous `get_active_ads` overload.
--
-- PROBLEM
-- Two overloads of get_active_ads currently exist in the live database:
--   1. get_active_ads(p_placement_type TEXT)
--        created by 20260227000000_campaign_notifications_and_lifecycle.sql
--   2. get_active_ads(p_placement_type placement_type,
--                     p_session_id TEXT DEFAULT NULL,
--                     p_user_id UUID DEFAULT NULL)
--        the current canonical signature (this is the one reflected in the
--        generated types at src/integrations/supabase/types.ts)
--
-- Because the parameter TYPE differs, the later CREATE OR REPLACE did not
-- replace the original — it added a second overload. Every single-argument call
-- is therefore ambiguous, and PostgREST answers with HTTP 300 / PGRST203
-- ("Could not choose the best candidate function"). This fired on EVERY page
-- load for every ad placement, on web and on any shipped mobile binary that
-- calls get_active_ads. Ads have effectively been failing open to the house-ad
-- fallback the entire time both overloads have coexisted.
--
-- FIX
-- Drop the superseded TEXT overload. This is *restorative*, not destructive:
-- with only one candidate remaining, the existing one-argument call sites
-- (`get_active_ads(p_placement_type => 'top_banner')`) resolve cleanly against
-- the canonical enum signature, whose extra parameters are all DEFAULT NULL.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- No shipped client loses a capability here — the call they make is currently
-- erroring for everyone, and after this migration it starts succeeding. The
-- request shape callers send is unchanged: a single p_placement_type argument.
-- The placement strings clients pass ('top_banner', 'featured_spot',
-- 'below_fold', 'sponsored_listing') are all valid members of the
-- `placement_type` enum, so implicit text->enum coercion applies. No response
-- field is removed: both overloads returned the same seven columns.
--
-- IF EXISTS is deliberate (and keeps scripts/check-migration-safety.mjs happy):
-- environments where the stray overload was never created are a no-op.

DROP FUNCTION IF EXISTS public.get_active_ads(TEXT);

-- Guard against a future CREATE OR REPLACE silently reintroducing a third
-- signature: fail loudly if more than one overload is present after this runs.
DO $$
DECLARE
  overload_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_active_ads';

  IF overload_count > 1 THEN
    RAISE EXCEPTION
      'get_active_ads still has % overloads; PostgREST cannot disambiguate single-arg calls (PGRST203)',
      overload_count;
  END IF;
END;
$$;
