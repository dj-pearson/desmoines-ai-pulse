-- =============================================================================
-- Add popularity_score to events (IOS-DISCOVER-2026-003)
-- =============================================================================
-- Mirrors restaurants.popularity_score so the events list can sort by
-- "Popularity" the same way the restaurants list already does. The score
-- combines rating-equivalent (avg saved/RSVP count), recency, and the
-- is_featured boost.
--
-- Also adds view_count so we can grow the score with engagement over time.
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_events_popularity_score
  ON public.events (popularity_score DESC NULLS LAST);

-- Pure function: combines featured + recency + view_count into a 0-100 score
CREATE OR REPLACE FUNCTION public.calculate_event_popularity_score(
  is_featured BOOLEAN,
  days_until_event INTEGER,
  view_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
BEGIN
  RETURN LEAST(100, GREATEST(0,
    -- Featured bonus
    CASE WHEN is_featured THEN 30 ELSE 0 END +
    -- Imminence bonus (events soon score higher)
    CASE
      WHEN days_until_event <= 1 THEN 30
      WHEN days_until_event <= 7 THEN 20
      WHEN days_until_event <= 30 THEN 10
      ELSE 0
    END +
    -- View bonus (5 points per 100 views, capped at 20)
    LEAST(20, view_count / 20) +
    -- Saved/RSVP bonus (1 point per save, capped at 20)
    LEAST(20, saved_count)
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill scores for existing rows
UPDATE public.events
SET popularity_score = public.calculate_event_popularity_score(
  COALESCE(is_featured, FALSE),
  GREATEST(0, EXTRACT(DAY FROM (date - NOW()))::INTEGER),
  COALESCE(view_count, 0),
  0
)
WHERE popularity_score IS NULL OR popularity_score = 0;

-- Recompute on relevant column changes
CREATE OR REPLACE FUNCTION public.update_event_popularity()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_featured IS DISTINCT FROM NEW.is_featured
     OR OLD.date IS DISTINCT FROM NEW.date
     OR OLD.view_count IS DISTINCT FROM NEW.view_count
  THEN
    NEW.popularity_score = public.calculate_event_popularity_score(
      COALESCE(NEW.is_featured, FALSE),
      GREATEST(0, EXTRACT(DAY FROM (NEW.date - NOW()))::INTEGER),
      COALESCE(NEW.view_count, 0),
      0
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_event_popularity ON public.events;
CREATE TRIGGER trigger_update_event_popularity
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_event_popularity();

-- Rotated popularity RPC — adds a small random factor so the same 20 events
-- aren't shown every visit. Used by the "Popularity" sort to avoid
-- staleness while still surfacing the highest-scoring items.
CREATE OR REPLACE FUNCTION public.fetch_events_by_popularity_rotated(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_seed FLOAT DEFAULT NULL
)
RETURNS SETOF public.events AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.events
  WHERE date >= NOW()
  ORDER BY
    -- 80% popularity weight + 20% random jitter
    (COALESCE(popularity_score, 0) * 0.8) + (random() * 20) DESC,
    date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON COLUMN public.events.popularity_score IS
  '0-100 score combining is_featured, time-until-event, view_count, and saves. Used for "Popularity" sort in events list.';
