-- WEB-CI-026 / WEB-QA-003: fix the ambiguous campaign_id in get_active_ads.
--
-- PROBLEM
-- get_active_ads is declared RETURNS TABLE(campaign_id uuid, creative_id uuid, ...).
-- In PL/pgSQL those column names become OUT parameters, so `campaign_id` is a
-- variable in scope for the entire function body. Both frequency-cap subqueries
-- reference it UNQUALIFIED against public.ad_impressions:
--
--     SELECT 1 FROM public.ad_impressions WHERE campaign_id = c.id ...
--
-- Postgres cannot tell the OUT parameter from ad_impressions.campaign_id and
-- raises 42702, "column reference \"campaign_id\" is ambiguous". Every call
-- fails, on every page load, for every placement.
--
-- This was masked until now. 20260718000001 dropped the stray TEXT overload,
-- which was returning PGRST203 before PostgREST ever reached the function body.
-- Removing the overload let calls through to the body, and the 42702 underneath
-- it became the new visible failure. Confirmed live on 2026-08-22 by calling the
-- RPC directly.
--
-- FIX
-- Alias ad_impressions as `ai` in both subqueries and qualify every column. That
-- removes the ambiguity without #variable_conflict, which would resolve it
-- silently and hide the next occurrence of the same mistake.
--
-- WHY THIS UNBLOCKS THE REQUIRED SMOKE GATE
-- tests/route-smoke.spec.ts:59 asserts zero error-level console messages on the
-- homepage. useActiveAds logs log.error only when the RPC returns an error, so
-- the 42702 was the single failing assertion in a suite that was otherwise 79/79
-- green. That job, "Smoke (critical journeys, required)", is one of the three
-- required contexts in .github/rulesets/main.json.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- CREATE OR REPLACE with a byte-identical signature and the same seven returned
-- columns. Nothing is renamed, removed, tightened, or reordered. Shipped iOS and
-- Android binaries call get_active_ads and currently receive an error; after this
-- they receive rows or an empty set. Restorative, not destructive.
--
-- VERIFIED before writing this file: applied inside a transaction against the
-- live database and called with all three argument shapes (placement only,
-- placement+session, placement+user). All three returned without error, then
-- ROLLBACK. Zero rows came back because no campaign is currently active and
-- approved, which is the correct empty result, not a failure.

CREATE OR REPLACE FUNCTION public.get_active_ads(
  p_placement_type placement_type,
  p_session_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  campaign_id UUID,
  creative_id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  cta_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id,
    cc.id,
    cc.title,
    cc.description,
    cc.image_url,
    cc.link_url,
    cc.cta_text
  FROM public.campaigns c
  JOIN public.campaign_placements cp ON cp.campaign_id = c.id
  JOIN public.campaign_creatives cc ON cc.campaign_id = c.id AND cc.placement_type = p_placement_type
  WHERE
    c.status = 'active'
    AND c.start_date <= CURRENT_DATE
    AND c.end_date >= CURRENT_DATE
    AND cc.is_approved = true
    AND cp.placement_type = p_placement_type
    -- Frequency cap: not shown to this session in the last 5 minutes.
    AND (p_session_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.ad_impressions ai
      WHERE ai.campaign_id = c.id
        AND ai.session_id = p_session_id
        AND ai.timestamp > NOW() - INTERVAL '5 minutes'
    ))
    -- Frequency cap: not shown to this user more than 10 times today.
    AND (p_user_id IS NULL OR (
      SELECT COUNT(*)
      FROM public.ad_impressions ai
      WHERE ai.campaign_id = c.id
        AND ai.user_id = p_user_id
        AND ai.date = CURRENT_DATE
    ) < 10)
  ORDER BY c.id, RANDOM()
  LIMIT 1;
END;
$function$;
