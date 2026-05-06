-- =============================================================================
-- Surprise Me — single committed recommendation (IOS-DISCOVER-2026-008)
-- =============================================================================
-- The "Surprise Me" button on the iOS Home tab calls get_surprise_pick to get
-- ONE event or restaurant + a templated reason string. We track Save vs Try
-- Another in surprise_pick_outcomes so we can measure acceptance rate and
-- tune the algorithm.
-- =============================================================================

-- Tracking table: one row per surface (so we can compute acceptance rate)
CREATE TABLE IF NOT EXISTS public.surprise_pick_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('event', 'restaurant')),
  item_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('shown', 'saved', 'tried_another', 'opened')),
  reason_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surprise_pick_outcomes_user
  ON public.surprise_pick_outcomes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surprise_pick_outcomes_item
  ON public.surprise_pick_outcomes (item_type, item_id);

ALTER TABLE public.surprise_pick_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own surprise outcomes"
  ON public.surprise_pick_outcomes;
CREATE POLICY "Users can insert their own surprise outcomes"
  ON public.surprise_pick_outcomes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can read their own surprise outcomes"
  ON public.surprise_pick_outcomes;
CREATE POLICY "Users can read their own surprise outcomes"
  ON public.surprise_pick_outcomes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Pick RPC: returns a single curated item + a templated reason
CREATE OR REPLACE FUNCTION public.get_surprise_pick(
  p_user_lat REAL DEFAULT NULL,
  p_user_lon REAL DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  reason TEXT,
  reason_template TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_pick_kind TEXT;
  v_event RECORD;
  v_restaurant RECORD;
  v_top_category TEXT;
  v_top_cuisine TEXT;
BEGIN
  v_user_id := auth.uid();

  -- 50/50 between event vs restaurant; both fall back to featured if the
  -- chosen kind has no candidates.
  v_pick_kind := CASE WHEN random() > 0.5 THEN 'event' ELSE 'restaurant' END;

  -- If signed in, peek at the user's most-favored category / cuisine for a
  -- more personalized reason string.
  IF v_user_id IS NOT NULL THEN
    SELECT category INTO v_top_category
    FROM (
      SELECT e.category, COUNT(*) AS cnt
      FROM swipe_interactions s
      JOIN events e ON e.id = s.item_id::uuid
      WHERE s.user_id = v_user_id AND s.action IN ('like', 'boost')
        AND e.category IS NOT NULL
      GROUP BY e.category
      ORDER BY cnt DESC
      LIMIT 1
    ) sub;

    SELECT cuisine INTO v_top_cuisine
    FROM (
      SELECT r.cuisine, COUNT(*) AS cnt
      FROM swipe_interactions s
      JOIN restaurants r ON r.id = s.item_id::uuid
      WHERE s.user_id = v_user_id AND s.action IN ('like', 'boost')
        AND r.cuisine IS NOT NULL
      GROUP BY r.cuisine
      ORDER BY cnt DESC
      LIMIT 1
    ) sub;
  END IF;

  IF v_pick_kind = 'event' THEN
    -- Prefer events soon + featured + (optionally) matching favored category
    SELECT e.id, e.title, e.description, e.image_url, e.category, e.date
    INTO v_event
    FROM events e
    WHERE e.date >= NOW()
      AND e.date < NOW() + INTERVAL '14 days'
      AND (
        v_top_category IS NULL
        OR e.category = v_top_category
        OR e.is_featured
      )
    ORDER BY
      CASE WHEN v_top_category IS NOT NULL AND e.category = v_top_category THEN 0 ELSE 1 END,
      e.is_featured DESC,
      random()
    LIMIT 1;

    IF v_event.id IS NOT NULL THEN
      RETURN QUERY SELECT
        'event'::TEXT,
        v_event.id,
        v_event.title,
        v_event.description,
        v_event.image_url,
        CASE
          WHEN v_top_category IS NOT NULL AND v_event.category = v_top_category
            THEN 'Because you''ve been into ' || v_top_category || ' lately and ' || v_event.title || ' is coming up.'
          ELSE 'Because ' || v_event.title || ' is exactly the kind of night out worth committing to.'
        END,
        CASE
          WHEN v_top_category IS NOT NULL AND v_event.category = v_top_category THEN 'category_match'
          ELSE 'featured_event'
        END;
      RETURN;
    END IF;
  END IF;

  -- Restaurant path (or fallback if no event was found)
  SELECT r.id, r.name, r.description, r.image_url, r.cuisine
  INTO v_restaurant
  FROM restaurants r
  WHERE r.is_featured OR r.popularity_score >= 50
  ORDER BY
    CASE WHEN v_top_cuisine IS NOT NULL AND r.cuisine = v_top_cuisine THEN 0 ELSE 1 END,
    random()
  LIMIT 1;

  IF v_restaurant.id IS NOT NULL THEN
    RETURN QUERY SELECT
      'restaurant'::TEXT,
      v_restaurant.id,
      v_restaurant.name,
      v_restaurant.description,
      v_restaurant.image_url,
      CASE
        WHEN v_top_cuisine IS NOT NULL AND v_restaurant.cuisine = v_top_cuisine
          THEN 'Because you''ve been into ' || v_top_cuisine || ' lately and ' || v_restaurant.name || ' nails it.'
        ELSE 'Because ' || v_restaurant.name || ' is the kind of place locals quietly love.'
      END,
      CASE
        WHEN v_top_cuisine IS NOT NULL AND v_restaurant.cuisine = v_top_cuisine THEN 'cuisine_match'
        ELSE 'featured_restaurant'
      END;
    RETURN;
  END IF;

  -- Final fallback — any event in the next 30 days (warm, generic reason)
  SELECT e.id, e.title, e.description, e.image_url
  INTO v_event
  FROM events e
  WHERE e.date >= NOW() AND e.date < NOW() + INTERVAL '30 days'
  ORDER BY random()
  LIMIT 1;

  IF v_event.id IS NOT NULL THEN
    RETURN QUERY SELECT
      'event'::TEXT,
      v_event.id,
      v_event.title,
      v_event.description,
      v_event.image_url,
      'Because trying something new is its own kind of plan — and ' || v_event.title || ' is on the menu.',
      'fallback';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_surprise_pick(REAL, REAL) TO anon, authenticated;

COMMENT ON FUNCTION public.get_surprise_pick IS
  'Returns ONE event or restaurant + a templated reason string for the iOS Surprise Me button (IOS-DISCOVER-2026-008).';
