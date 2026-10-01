-- NON_CORE_REVIEW_2026-09 WP3: get_active_ads serves a random eligible
-- campaign, on Des Moines dates.
--
-- 1. ONE ADVERTISER GOT EVERY IMPRESSION.
--    The body was SELECT DISTINCT ON (c.id) ... ORDER BY c.id, RANDOM() LIMIT 1.
--    DISTINCT ON needs its expression first in the ORDER BY, so the rows were
--    sorted by campaign id and RANDOM() only chose among one campaign's
--    creatives. LIMIT 1 then took the lowest UUID. With two paid campaigns in
--    a placement, the one whose id sorted first got every impression until
--    its frequency cap hid it for five minutes.
--
--    Now: one random creative per eligible campaign, then one random campaign.
--    Each campaign gets an equal share whatever number of creatives it has.
--
-- 2. THE DAY TURNED OVER AT 7PM.
--    start_date <= CURRENT_DATE and end_date >= CURRENT_DATE ran in the
--    session time zone, UTC on Supabase. A campaign bought for Friday started
--    at 7pm Thursday Central (6pm in winter) and stopped at the same hour on
--    its last day. Advertise.tsx and create-campaign-checkout count days in
--    America/Chicago, so the dates are compared to the Central calendar date.
--
--    The per-user daily cap still compares ad_impressions.date with
--    CURRENT_DATE: track-ad-event writes that column as the UTC date, and the
--    cap must count on the same calendar the writer uses.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): CREATE OR REPLACE with the identical
-- signature (placement_type, text, uuid) and the same seven returned columns
-- in the same order. iOS and Android call this RPC; nothing they read changes.

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
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
  RETURN QUERY
  WITH per_campaign AS (
    -- One random approved creative per eligible campaign. The OUT parameters
    -- above are named campaign_id etc., so every column here is qualified and
    -- aliased to avoid 42702 (see 20260822000001).
    SELECT DISTINCT ON (c.id)
      c.id           AS pc_campaign_id,
      cc.id          AS pc_creative_id,
      cc.title       AS pc_title,
      cc.description AS pc_description,
      cc.image_url   AS pc_image_url,
      cc.link_url    AS pc_link_url,
      cc.cta_text    AS pc_cta_text
    FROM public.campaigns c
    JOIN public.campaign_placements cp
      ON cp.campaign_id = c.id AND cp.placement_type = p_placement_type
    JOIN public.campaign_creatives cc
      ON cc.campaign_id = c.id AND cc.placement_type = p_placement_type
    WHERE
      c.status = 'active'
      AND c.start_date::date <= v_today
      AND c.end_date::date >= v_today
      AND cc.is_approved = true
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
  )
  SELECT
    pc.pc_campaign_id,
    pc.pc_creative_id,
    pc.pc_title,
    pc.pc_description,
    pc.pc_image_url,
    pc.pc_link_url,
    pc.pc_cta_text
  FROM per_campaign pc
  ORDER BY RANDOM()
  LIMIT 1;
END;
$function$;
