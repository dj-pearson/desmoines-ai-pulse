-- Home pass-2 WP3 item 1 (docs/page-plans/home-pass2.md): the For You rail
-- RPCs stop returning unpublished events.
--
-- PROBLEM
-- get_trending_events and get_personalized_recommendations (both last defined
-- in 20260822000002) select from public.events with only `e.date >= NOW()`.
-- Neither applies the three unpublish switches every other public events read
-- applies (src/lib/eventQuery.ts applyEventVisibility):
--   is_merged   - folded into a duplicate (WEB-AUTO-005)
--   is_hidden   - soft-hidden by a moderator or the stale sweep (WEB-AUTO-006)
--   archived_at - retired by the archive sweep (WEB-BE-034)
-- Both are SECURITY DEFINER, so RLS does not filter them either. A merged or
-- hidden event could headline the rail and then dead-end on "Event Not Found".
--
-- The web Home rail no longer calls get_trending_events for anonymous visitors
-- (it reads events directly, ordered by trending_score). Shipped iOS/Android
-- binaries still call both, which is why this is still worth applying.
--
-- WHAT CHANGES
-- Three predicates in each WHERE clause. Nothing else: same arguments, same
-- RETURNS TABLE (names, order and types), same scoring, same grants. The
-- bodies are copied from 20260822000002 with blank padding lines removed.
-- Because the signature is unchanged, CREATE OR REPLACE is enough; no DROP.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- Additive filtering on rows that are already unpublished everywhere else.
-- No argument, return column or type changes, so every shipped client parses
-- the result exactly as before. `IS NOT TRUE` keeps rows whose flag is NULL,
-- matching PostgREST's `neq.true` in applyEventVisibility.
--
-- NOT APPLIED BY THE WEB CHANGE. Listed as a deferred P0 in the plan; apply
-- with `supabase db push` after review.

CREATE OR REPLACE FUNCTION public.get_trending_events(p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, title text, date timestamp with time zone, location text, category text, image_url text, price text, venue text, is_featured boolean, event_start_utc timestamp with time zone, event_start_local timestamp without time zone, city text, latitude real, longitude real, enhanced_description text, recommendation_score double precision, recommendation_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.title, e.date, e.location, e.category, e.image_url, e.price,
    e.venue, e.is_featured, e.event_start_utc, e.event_start_local, e.city,
    e.latitude, e.longitude, e.enhanced_description,
    -- Score = popularity_score + featured boost + recency
    (
      COALESCE(e.popularity_score, 0)::FLOAT
      + CASE WHEN e.is_featured THEN 20 ELSE 0 END
      + CASE
          WHEN e.date <= NOW() + INTERVAL '3 days' THEN 15
          WHEN e.date <= NOW() + INTERVAL '14 days' THEN 5
          ELSE 0
        END
      + (random() * 5)
    )::FLOAT AS recommendation_score,
    'Trending now'::TEXT AS recommendation_reason
  FROM events e
  WHERE e.date >= NOW()
    -- Unpublished rows stay out (WEB-AUTO-005/006, WEB-BE-034).
    AND e.is_merged IS NOT TRUE
    AND e.is_hidden IS NOT TRUE
    AND e.archived_at IS NULL
  ORDER BY recommendation_score DESC
  LIMIT p_limit;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_trending_events(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(p_user_lat real DEFAULT NULL::real, p_user_lon real DEFAULT NULL::real, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, title text, date timestamp with time zone, location text, category text, image_url text, price text, venue text, is_featured boolean, event_start_utc timestamp with time zone, event_start_local timestamp without time zone, city text, latitude real, longitude real, enhanced_description text, recommendation_score double precision, recommendation_reason text)
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
    END AS recommendation_reason
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
GRANT EXECUTE ON FUNCTION public.get_personalized_recommendations(real, real, integer) TO anon, authenticated, service_role;
