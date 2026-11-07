-- WEB-PERF-052: get_personalized_recommendations_v2, the For You RPC with the
-- sponsorship columns, so the web rail stops making a follow-up events read.
--
-- WHY A V2 AND NOT CREATE OR REPLACE ON V1
-- The web rail called get_personalized_recommendations and then read
-- events(id, is_sponsored, sponsored_until) for the same ids, because the RPC
-- returns no sponsorship columns and the card needs them for the badge. That
-- follow-up also dropped unpublished rows, which the RPC has filtered itself
-- since 20260929000001.
--
-- The v1 return type is a RETURNS TABLE, i.e. a set of OUT parameters, and
-- Postgres refuses a CREATE OR REPLACE that adds one ("cannot change return
-- type of existing function"). Adding columns to v1 would take DROP + CREATE,
-- and for that window every shipped iOS/Android binary calling v1
-- (ios ForYouService.swift, android ForYouRemoteDataSource.kt) would get
-- PGRST202. So v1 stays exactly as 20260929000001 defined it, and v2 is a new
-- function: same arguments, same body, same columns in the same order, plus
-- is_sponsored and sponsored_until at the end.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- New function only. v1 is untouched, so no shipped client changes behaviour.
-- The web falls back to v1 + the follow-up read while this migration is
-- unapplied (PGRST202 on v2), so applying it changes request count, not
-- correctness. v1 can retire only after the apps move to v2 and
-- MIN_SUPPORTED_APP_VERSION excludes the binaries that call v1.

CREATE OR REPLACE FUNCTION public.get_personalized_recommendations_v2(p_user_lat real DEFAULT NULL::real, p_user_lon real DEFAULT NULL::real, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, title text, date timestamp with time zone, location text, category text, image_url text, price text, venue text, is_featured boolean, event_start_utc timestamp with time zone, event_start_local timestamp without time zone, city text, latitude real, longitude real, enhanced_description text, recommendation_score double precision, recommendation_reason text, is_sponsored boolean, sponsored_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  -- Compute swipe signals decayed by age (linear, 0..1 over 90 days).
  -- Per-category aggregate so we can boost categories the user signaled on.
  RETURN QUERY
  WITH swipe_decayed AS (
    SELECT
      si.item_id,
      si.action,
      -- Linear decay: signal weight = max(0, 1 - age_days / 90)
      GREATEST(0, 1.0 - EXTRACT(DAY FROM (NOW() - si.created_at)) / 90.0) AS decay,
      e.category AS event_category
    FROM swipe_interactions si
    LEFT JOIN events e ON e.id = si.item_id
    WHERE si.user_id = v_user_id
      AND si.item_type = 'event'
      AND si.created_at >= NOW() - INTERVAL '90 days'
  ),
  per_item_swipe AS (
    SELECT
      item_id,
      SUM(
        CASE action
          WHEN 'boost' THEN 50
          WHEN 'like' THEN 30
          WHEN 'detail' THEN 10
          WHEN 'skip' THEN -40
          ELSE 0
        END * decay
      ) AS item_score
    FROM swipe_decayed
    GROUP BY item_id
  ),
  per_category_swipe AS (
    SELECT
      event_category AS category,
      SUM(
        CASE action
          WHEN 'boost' THEN 50
          WHEN 'like' THEN 30
          WHEN 'detail' THEN 10
          WHEN 'skip' THEN -40
          ELSE 0
        END * decay
      ) / GREATEST(1, COUNT(*)) AS category_score
    FROM swipe_decayed
    WHERE event_category IS NOT NULL
    GROUP BY event_category
  ),
  legacy_categories AS (
    SELECT ARRAY_AGG(DISTINCT e.category) AS cats
    FROM user_event_interactions uei
    JOIN events e ON e.id = uei.event_id
    WHERE uei.user_id = v_user_id
      AND uei.interaction_type IN ('favorite', 'view')
  )
  SELECT
    e.id,
    e.title,
    e.date,
    e.location,
    e.category,
    e.image_url,
    e.price,
    e.venue,
    e.is_featured,
    e.event_start_utc,
    e.event_start_local,
    e.city,
    e.latitude,
    e.longitude,
    e.enhanced_description,
    -- Combined score: legacy category match + swipe per-item + swipe per-category + featured boost + recency
    (
      CASE WHEN e.category IN (SELECT unnest(cats) FROM legacy_categories) THEN 25 ELSE 0 END
      + COALESCE(pis.item_score, 0)
      + COALESCE(pcs.category_score, 0)
      + CASE WHEN e.is_featured THEN 15 ELSE 0 END
      + CASE
          WHEN e.date <= NOW() + INTERVAL '7 days' THEN 10
          WHEN e.date <= NOW() + INTERVAL '30 days' THEN 5
          ELSE 0
        END
      -- Random jitter so the same 12 events don't show every refresh
      + (random() * 5)
    )::FLOAT AS recommendation_score,
    CASE
      WHEN COALESCE(pcs.category_score, 0) > 20 THEN 'Based on your interest in ' || e.category
      WHEN e.is_featured THEN 'Featured this week'
      WHEN e.date <= NOW() + INTERVAL '7 days' THEN 'Coming up soon'
      ELSE 'Popular in Des Moines'
    END AS recommendation_reason,
    -- The two columns v1 lacks; the web card reads them for the badge.
    e.is_sponsored,
    e.sponsored_until
  FROM events e
  LEFT JOIN per_item_swipe pis ON pis.item_id = e.id
  LEFT JOIN per_category_swipe pcs ON pcs.category = e.category
  WHERE e.date >= NOW()
    -- Unpublished rows stay out (WEB-AUTO-005/006, WEB-BE-034).
    AND e.is_merged IS NOT TRUE
    AND e.is_hidden IS NOT TRUE
    AND e.archived_at IS NULL
    -- Drop items the user explicitly skipped recently
    AND COALESCE(pis.item_score, 0) > -20
  ORDER BY recommendation_score DESC
  LIMIT p_limit;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_personalized_recommendations_v2(real, real, integer) TO anon, authenticated, service_role;
