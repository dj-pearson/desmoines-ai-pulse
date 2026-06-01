-- =============================================================================
-- For You — extend get_personalized_recommendations with swipe signals
-- =============================================================================
-- IOS-DISCOVER-2026-002. Replaces the v1 RPC so it factors swipe_interactions
-- alongside the existing user_event_interactions:
--   boost = +50 (strong "more like this" signal)
--   like  = +30 (right swipe / favorite)
--   detail= +10 (opened the card)
--   skip  = -40 (left swipe / hide similar items)
--
-- Scores apply both per-item (suppress this exact item from list if skipped)
-- and per-category (weight items in the same category proportionally).
--
-- 90-day decay: each signal's contribution decays linearly to 0 over 90 days
-- so old swipes don't dominate forever.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(
  p_user_lat REAL DEFAULT NULL,
  p_user_lon REAL DEFAULT NULL,
  p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  date DATE,
  location TEXT,
  category TEXT,
  image_url TEXT,
  price TEXT,
  venue TEXT,
  is_featured BOOLEAN,
  event_start_utc TIMESTAMPTZ,
  event_start_local TIMESTAMPTZ,
  city TEXT,
  latitude REAL,
  longitude REAL,
  enhanced_description TEXT,
  recommendation_score FLOAT,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      CASE WHEN e.category = ANY((SELECT cats FROM legacy_categories)) THEN 25 ELSE 0 END
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
    -- Drop items the user explicitly skipped recently
    AND COALESCE(pis.item_score, 0) > -20
  ORDER BY recommendation_score DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_personalized_recommendations(REAL, REAL, INTEGER)
  TO authenticated;

COMMENT ON FUNCTION public.get_personalized_recommendations IS
  'For You rail (iOS HomeView + web home page). Factors swipe_interactions with 90-day decay alongside legacy user_event_interactions.';

-- ---------------------------------------------------------------------------
-- Trending events fallback (used as cold-start when user has fewer than 5
-- swipes). Returns the same column shape so the iOS rail can swap RPCs
-- without changing the decoder.
-- ---------------------------------------------------------------------------

-- Drop first so we can change the return type (new columns added).
DROP FUNCTION IF EXISTS public.get_trending_events(INTEGER);

CREATE OR REPLACE FUNCTION public.get_trending_events(
  p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  date DATE,
  location TEXT,
  category TEXT,
  image_url TEXT,
  price TEXT,
  venue TEXT,
  is_featured BOOLEAN,
  event_start_utc TIMESTAMPTZ,
  event_start_local TIMESTAMPTZ,
  city TEXT,
  latitude REAL,
  longitude REAL,
  enhanced_description TEXT,
  recommendation_score FLOAT,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  ORDER BY recommendation_score DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_events(INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_trending_events IS
  'Cold-start fallback for the For You rail when the user has fewer than 5 swipes.';
