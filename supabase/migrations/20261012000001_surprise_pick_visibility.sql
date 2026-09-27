-- IOS-DD-DISCOVER-18: get_surprise_pick deals only live, visible rows, stops
-- ranking is_featured first without a label, and can exclude recent picks.
--
-- As defined in 20260506000009_surprise_me.sql the function:
--   * filtered events on date alone, with no is_merged / is_hidden /
--     archived_at check, and restaurants on nothing but is_featured or
--     popularity. It is SECURITY DEFINER, so RLS never helped: a merged,
--     hidden, archived or permanently closed row could be "the pick".
--   * excluded a multi-day event already in progress (date >= NOW() only).
--   * ordered `e.is_featured DESC` and admitted `r.is_featured` rows.
--     is_featured means editorial or paid (featured-flag-invariant.test.ts;
--     iOS labels it Sponsored since group 2), so the organic pick was an
--     unlabelled ad slot. The labelled paid path is get-sponsored-pick.
--   * had no way to avoid repeats: "Try another" could hand back the same
--     thing, and a card the user just skipped in Discover could come up.
--
-- Now: every events read applies the three visibility predicates, "upcoming"
-- is `date >= NOW() OR end_date >= NOW()` with the upper bounds unchanged,
-- restaurants must not be merged or closed (business_status or status), and
-- is_featured plays no part. p_exclude_ids drops ids the caller has just seen;
-- a signed-in caller also skips ids they skipped in Discover in the last 30
-- days and ids they rolled past ("tried_another") in the last 7. The reason
-- templates that claimed a feature are renamed for what now decides:
-- featured_event -> upcoming_event, featured_restaurant -> popular_restaurant
-- (popularity_score >= 50).
--
-- It also selected e.description, a column events does not have (it carries
-- enhanced_description and original_description; discover-chat documents the
-- same repair under WEB-QA-019). plpgsql resolves that at run time, so every
-- roll that took the event branch failed. Both event selects now COALESCE the
-- pair into `description`.
--
-- BACKWARD COMPATIBILITY. A third parameter with a default is additive per
-- CLAUDE.md, but CREATE OR REPLACE with a new argument list creates an
-- OVERLOAD, and PostgREST then answers the shipped two-argument named call
-- with PGRST203 (ambiguous). So the (REAL, REAL) signature is dropped and the
-- function recreated with all three arguments defaulted, in one transaction.
-- Shipped iOS and Android send p_user_lat / p_user_lon (both optional) by
-- name, which resolves to the new function. The RETURNS TABLE columns are
-- identical. reason_template is free text on surprise_pick_outcomes (no
-- CHECK), so the renamed values need no schema change.

BEGIN;

DROP FUNCTION IF EXISTS public.get_surprise_pick(REAL, REAL);

CREATE OR REPLACE FUNCTION public.get_surprise_pick(
  p_user_lat REAL DEFAULT NULL,
  p_user_lon REAL DEFAULT NULL,
  p_exclude_ids UUID[] DEFAULT NULL
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
  v_exclude UUID[];
BEGIN
  v_user_id := auth.uid();
  v_exclude := coalesce(p_exclude_ids, '{}'::UUID[]);

  -- 50/50 between event vs restaurant; the restaurant path is also the
  -- fallback when the chosen kind has no candidates.
  v_pick_kind := CASE WHEN random() > 0.5 THEN 'event' ELSE 'restaurant' END;

  -- If signed in, peek at the user's most-liked category / cuisine for a
  -- more personalized reason string. Only visible rows count.
  IF v_user_id IS NOT NULL THEN
    SELECT sub.category INTO v_top_category
    FROM (
      SELECT e.category, COUNT(*) AS cnt
      FROM swipe_interactions s
      JOIN events e ON e.id = s.item_id::uuid
      WHERE s.user_id = v_user_id AND s.action IN ('like', 'boost')
        AND e.category IS NOT NULL
        AND e.is_merged IS NOT TRUE AND e.is_hidden IS NOT TRUE AND e.archived_at IS NULL
      GROUP BY e.category
      ORDER BY cnt DESC
      LIMIT 1
    ) sub;

    SELECT sub.cuisine INTO v_top_cuisine
    FROM (
      SELECT r.cuisine, COUNT(*) AS cnt
      FROM swipe_interactions s
      JOIN restaurants r ON r.id = s.item_id::uuid
      WHERE s.user_id = v_user_id AND s.action IN ('like', 'boost')
        AND r.cuisine IS NOT NULL
        AND r.is_merged IS NOT TRUE
      GROUP BY r.cuisine
      ORDER BY cnt DESC
      LIMIT 1
    ) sub;
  END IF;

  IF v_pick_kind = 'event' THEN
    -- Soon, visible, not just seen; the favored category first.
    SELECT e.id, e.title, COALESCE(e.enhanced_description, e.original_description) AS description,
           e.image_url, e.category, e.date
    INTO v_event
    FROM events e
    WHERE (e.date >= NOW() OR e.end_date >= NOW())
      AND e.date < NOW() + INTERVAL '14 days'
      AND e.is_merged IS NOT TRUE AND e.is_hidden IS NOT TRUE AND e.archived_at IS NULL
      AND NOT (e.id = ANY(v_exclude))
      AND (v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM swipe_interactions s
        WHERE s.user_id = v_user_id AND s.item_type = 'event' AND s.item_id = e.id
          AND s.action = 'skip' AND s.created_at > NOW() - INTERVAL '30 days'
      ))
      AND (v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM surprise_pick_outcomes o
        WHERE o.user_id = v_user_id AND o.item_type = 'event' AND o.item_id = e.id
          AND o.outcome = 'tried_another' AND o.created_at > NOW() - INTERVAL '7 days'
      ))
    ORDER BY
      CASE WHEN v_top_category IS NOT NULL AND e.category = v_top_category THEN 0 ELSE 1 END,
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
          ELSE 'Because ' || v_event.title || ' is coming up soon.'
        END,
        CASE
          WHEN v_top_category IS NOT NULL AND v_event.category = v_top_category THEN 'category_match'
          ELSE 'upcoming_event'
        END;
      RETURN;
    END IF;
  END IF;

  -- Restaurant path (or fallback if no event was found).
  SELECT r.id, r.name, r.description, r.image_url, r.cuisine
  INTO v_restaurant
  FROM restaurants r
  WHERE r.popularity_score >= 50
    AND r.is_merged IS NOT TRUE
    AND coalesce(upper(r.business_status), '') NOT IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY')
    AND coalesce(lower(r.status), '') NOT IN ('closed', 'permanently_closed', 'closed_permanently')
    AND NOT (r.id = ANY(v_exclude))
    AND (v_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM swipe_interactions s
      WHERE s.user_id = v_user_id AND s.item_type = 'restaurant' AND s.item_id = r.id
        AND s.action = 'skip' AND s.created_at > NOW() - INTERVAL '30 days'
    ))
    AND (v_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM surprise_pick_outcomes o
      WHERE o.user_id = v_user_id AND o.item_type = 'restaurant' AND o.item_id = r.id
        AND o.outcome = 'tried_another' AND o.created_at > NOW() - INTERVAL '7 days'
    ))
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
        ELSE 'Because ' || v_restaurant.name || ' is one of the most popular spots in town right now.'
      END,
      CASE
        WHEN v_top_cuisine IS NOT NULL AND v_restaurant.cuisine = v_top_cuisine THEN 'cuisine_match'
        ELSE 'popular_restaurant'
      END;
    RETURN;
  END IF;

  -- Final fallback: any visible event in the next 30 days, still not one the
  -- caller asked to exclude.
  SELECT e.id, e.title, COALESCE(e.enhanced_description, e.original_description) AS description,
         e.image_url
  INTO v_event
  FROM events e
  WHERE (e.date >= NOW() OR e.end_date >= NOW())
    AND e.date < NOW() + INTERVAL '30 days'
    AND e.is_merged IS NOT TRUE AND e.is_hidden IS NOT TRUE AND e.archived_at IS NULL
    AND NOT (e.id = ANY(v_exclude))
  ORDER BY random()
  LIMIT 1;

  IF v_event.id IS NOT NULL THEN
    RETURN QUERY SELECT
      'event'::TEXT,
      v_event.id,
      v_event.title,
      v_event.description,
      v_event.image_url,
      'Because trying something new is its own kind of plan - and ' || v_event.title || ' is on the menu.',
      'fallback';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_surprise_pick(REAL, REAL, UUID[]) TO anon, authenticated;

COMMENT ON FUNCTION public.get_surprise_pick(REAL, REAL, UUID[]) IS
  'Returns ONE visible event or open restaurant + a templated reason string for Surprise Me (IOS-DISCOVER-2026-008, IOS-DD-DISCOVER-18). No featured-flag ranking; p_exclude_ids skips recent picks.';

COMMIT;

NOTIFY pgrst, 'reload schema';
