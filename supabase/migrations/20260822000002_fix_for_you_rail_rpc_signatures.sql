-- WEB-BE-033: fix the declared return signatures of the For You rail RPCs.
--
-- PROBLEM
-- public.get_trending_events declares RETURNS TABLE(... date DATE ...) while its
-- body selects e.date from public.events, which is timestamptz. Postgres raises
-- 42804 "structure of query does not match function result type" the moment the
-- query produces a row, so the function has never returned one. Measured live:
--   POST /rest/v1/rpc/get_trending_events {} -> 400
--   {"code":"42804","details":"Returned type timestamp with time zone does not
--    match expected type date in column 3."}
--
-- TWO MISMATCHES, NOT ONE. Postgres reports only the FIRST offending column, so
-- fixing column 3 alone would have produced a second 42804 on the next call.
-- Comparing all 17 declared types against information_schema for the columns the
-- body actually selects:
--   column  3  date               declared date                     -> actually timestamptz
--   column 11  event_start_local  declared timestamp WITH time zone -> actually timestamp WITHOUT time zone
-- The other 15 match, including the two ::FLOAT / ::TEXT casts at the end.
--
-- THE SIBLING HAS THE IDENTICAL DEFECT and it was NOT visible from a probe.
-- get_personalized_recommendations declares the same 17 columns with the same
-- two wrong types and selects the same columns. Calling it anonymously returns
-- [] and looks healthy -- but only because it starts with
--   v_user_id := auth.uid(); IF v_user_id IS NULL THEN RETURN; END IF;
-- so it never produces a row for an anonymous caller. A RETURNS TABLE mismatch
-- is only detected when a row is actually produced, so every signed-in user
-- hitting the For You rail got the same 42804. An empty result is not proof.
--
-- WHY DROP + CREATE
-- CREATE OR REPLACE cannot alter a RETURNS TABLE signature; Postgres rejects it
-- with "cannot change return type of existing function". scripts/check-migration-
-- safety.mjs explicitly permits DROP FUNCTION IF EXISTS used purely to recreate.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- This changes two declared return column types, which would normally be a
-- multi-release deprecation. It is safe here because BOTH functions error on
-- every call that would return data -- no client has ever successfully parsed a
-- row from either. Restorative, not destructive, exactly like 20260822000001.
-- The column NAMES, the column ORDER and the argument signatures are unchanged,
-- so callers (useForYouRail.ts:65, useEventRecommendations.ts:65 and :114) need
-- no change. Grants are re-applied below because DROP discards them.
--
--
-- A THIRD DEFECT, found by exercising the signed-in path rather than probing.
-- get_personalized_recommendations also contained:
--   CASE WHEN e.category = ANY((SELECT cats FROM legacy_categories)) ...
-- `ANY((SELECT ...))` is the SUBQUERY form of ANY, and that subquery returns a
-- single text[] value, so Postgres compares text = text[] and raises
--   operator does not exist: text = text[]
-- It is rewritten as `IN (SELECT unnest(cats) FROM legacy_categories)`, which is
-- the intended semantics: does this event's category appear among the categories
-- the user has favourited or viewed.
--
-- So the personalized rail was broken for signed-in users for TWO independent
-- reasons, and neither was reachable by calling the RPC anonymously -- the
-- auth.uid() guard returns early before either can fire.
-- The bodies below are the live definitions, copied verbatim; the two types in each RETURNS TABLE
-- clause and the ANY-to-IN rewrite above are the only changes.


DROP FUNCTION IF EXISTS public.get_trending_events(integer);

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

  ORDER BY recommendation_score DESC

  LIMIT p_limit;

END;

$function$;

GRANT EXECUTE ON FUNCTION public.get_trending_events(integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_personalized_recommendations(real, real, integer);

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

    -- Drop items the user explicitly skipped recently

    AND COALESCE(pis.item_score, 0) > -20

  ORDER BY recommendation_score DESC

  LIMIT p_limit;

END;

$function$;

GRANT EXECUTE ON FUNCTION public.get_personalized_recommendations(real, real, integer) TO anon, authenticated, service_role;
