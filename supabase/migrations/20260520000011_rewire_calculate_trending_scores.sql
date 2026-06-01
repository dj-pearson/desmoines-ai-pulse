-- TRENDING-FN-001: rewire calculate_trending_scores() to read weights from
-- public.trending_config so the admin Trending tuner actually changes
-- scoring.
--
-- Scope deviation from prd.json: writes a NEW column public.events.trending_score
-- instead of overwriting popularity_score. Reason: popularity_score is
-- maintained by an existing BEFORE UPDATE trigger (migration
-- 20260506000008_events_popularity_score.sql) that recomputes the
-- structural "featured + imminence + view_count + saves" score on every
-- row edit. If this scheduled function wrote popularity_score, the next
-- admin edit would silently revert the engagement-weighted score back to
-- the structural score. Keeping the two signals on separate columns
-- avoids the tug-of-war and lets a future story switch the public
-- "Popularity" sort to trending_score if engagement-weighting is wanted
-- there too.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS trending_score NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_events_trending_score
  ON public.events (trending_score DESC NULLS LAST);

COMMENT ON COLUMN public.events.trending_score IS
  'Engagement-weighted trending score recomputed by calculate_trending_scores() on a schedule. Distinct from popularity_score, which is a per-row structural score maintained by trigger.';

-- Drop any prior dashboard-created version so this migration is the
-- single source of truth.
DROP FUNCTION IF EXISTS public.calculate_trending_scores();

CREATE OR REPLACE FUNCTION public.calculate_trending_scores()
RETURNS INTEGER  -- number of rows scored
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ;
  v_rows_updated INTEGER := 0;
BEGIN
  -- Read the tunable config (singleton row id=1).
  SELECT
    view_weight,
    favorite_weight,
    share_weight,
    click_weight,
    recency_half_life_hours,
    min_age_hours,
    featured_boost
  INTO cfg
  FROM public.trending_config
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'trending_config row missing; using documented defaults';
    cfg.view_weight := 1.0;
    cfg.favorite_weight := 5.0;
    cfg.share_weight := 3.0;
    cfg.click_weight := 2.0;
    cfg.recency_half_life_hours := 24.0;
    cfg.min_age_hours := 0.0;
    cfg.featured_boost := 10.0;
  END IF;

  -- Engagement window: last 7 days of activity.
  v_window_start := v_now - INTERVAL '7 days';

  WITH counts AS (
    SELECT
      e.id AS event_id,
      e.is_featured,
      EXTRACT(EPOCH FROM (v_now - e.created_at)) / 3600.0 AS age_hours,
      COALESCE(SUM(CASE WHEN i.interaction_type = 'view'  THEN 1 ELSE 0 END), 0) AS view_count,
      COALESCE(SUM(CASE WHEN i.interaction_type = 'click' THEN 1 ELSE 0 END), 0) AS click_count,
      COALESCE(SUM(CASE WHEN i.interaction_type = 'share' THEN 1 ELSE 0 END), 0) AS share_count,
      COALESCE(SUM(CASE WHEN i.interaction_type = 'save'  THEN 1 ELSE 0 END), 0) AS save_count,
      COALESCE((
        SELECT COUNT(*) FROM public.user_event_feedback uf
        WHERE uf.event_id = e.id
          AND uf.feedback_type IN ('thumbs_up', 'interested')
          AND uf.created_at >= v_window_start
      ), 0) AS favorite_count
    FROM public.events e
    LEFT JOIN public.user_event_interactions i
      ON i.event_id = e.id
     AND i.created_at >= v_window_start
    -- Only score events that are still relevant (today or in the future).
    WHERE e.date >= (v_now::DATE)
    GROUP BY e.id, e.is_featured, e.created_at
  ),
  scored AS (
    SELECT
      event_id,
      CASE
        WHEN age_hours < cfg.min_age_hours THEN 0
        ELSE
          ((view_count  * cfg.view_weight)
         + (favorite_count * cfg.favorite_weight)
         + ((share_count + save_count) * cfg.share_weight)
         + (click_count * cfg.click_weight))
          * EXP(-age_hours / NULLIF(cfg.recency_half_life_hours, 0))
          + CASE WHEN is_featured THEN cfg.featured_boost ELSE 0 END
      END AS score
    FROM counts
  )
  UPDATE public.events e
  SET trending_score = ROUND(GREATEST(0, s.score)::NUMERIC, 4)
  FROM scored s
  WHERE e.id = s.event_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated;
END;
$$;

COMMENT ON FUNCTION public.calculate_trending_scores() IS
  'Recomputes events.trending_score using the latest trending_config weights over the last 7 days of user_event_interactions + user_event_feedback. Called by the calculate-trending edge function.';

-- Service role + admin can call it directly via RPC if needed.
GRANT EXECUTE ON FUNCTION public.calculate_trending_scores() TO service_role;
