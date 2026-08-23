-- WEB-QA-019 AC2: make view counting real.
--
-- All three functions the client calls were missing. Probed anonymously against
-- production 2026-08-22, every one returns PGRST202:
--   increment_event_view, increment_restaurant_view, batch_increment_views
-- src/hooks/useViewTracking.ts calls each of them and swallows the failure at
-- debug level, which console-stripping removes from production builds.
--
-- WHAT THAT ACTUALLY PRODUCED, which is worse than "view counting is dead".
-- The hook does not degrade to showing nothing. generateFallbackData() hashes
-- the entity id into a number between 50 and 250, calls 30% of it "recent
-- views", and derives a "trending score" from it. EventCard.tsx then renders
--   ViewCountBadge  viewCount={recent_views} timeframe="last hour"   when > 20
--   SocialProofBadge type="trending"                                  when > 70
-- so a large share of event cards has been showing invented social proof to
-- real users. events.view_count exists and is 0 across all 1,246 rows, which is
-- the true number.
--
-- AC1 says "implement it, or remove the call and its fallback path". Both: the
-- functions are implemented here, and the fabricating fallback is deleted in
-- the same commit.

-- Restaurants had no counter at all. Additive and nullable with a constant
-- default, so no table rewrite and no older client affected.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

/**
 * Record one view of an event.
 *
 * SECURITY DEFINER because the caller is anonymous and must NOT hold UPDATE on
 * events. The function is the whole grant: it can only ever add one to one
 * counter on one row.
 */
CREATE OR REPLACE FUNCTION public.increment_event_view(event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.events
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = event_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_restaurant_view(restaurant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.restaurants
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = restaurant_id;
$$;

/**
 * Record one view for each of several events, for list pages.
 *
 * Capped at 200 ids. The function is anonymous-callable and writes with the
 * definer's rights, so an uncapped array would let one request drive an
 * unbounded number of privileged updates -- the same bound log-content-metrics
 * puts on its batch (WEB-SEC-022). Excess ids are dropped rather than the call
 * rejected: losing impressions off the end of an oversized batch beats losing
 * the whole batch.
 *
 * DISTINCT so a duplicated id in one batch counts once.
 */
CREATE OR REPLACE FUNCTION public.batch_increment_views(event_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.events e
     SET view_count = COALESCE(e.view_count, 0) + 1
   FROM (
     SELECT DISTINCT id FROM unnest(event_ids[1:200]) AS id
   ) AS wanted
   WHERE e.id = wanted.id;
$$;

/**
 * The numbers the card actually renders.
 *
 * useViewTracking read `event_analytics` and `restaurant_analytics` for
 * (view_count, recent_views_24h, trending_score). NEITHER TABLE EXISTS -- both
 * return 42P01 -- which is what routed every call into the fabricating
 * fallback. One function replaces both reads.
 *
 * recent_views_24h and trending_score are returned as 0 ON PURPOSE, and that is
 * the honest answer rather than a stub. Nothing records WHEN a view happened:
 * view_count is a lifetime total with no per-view log behind it. content_metrics
 * looked like a recency source until it was measured -- 23,160 of its rows are
 * content_type='page' and only 16 are 'event', none in the last 24 hours -- so
 * it cannot answer "views in the last hour" either.
 *
 * Returning 0 keeps both badges unrendered, since EventCard gates them on
 * recent_views > 20 and trending_score > 70. A badge claiming "42 views in the
 * last hour" has to be backed by 42 views in the last hour. Give this a real
 * per-view log and it can start returning a real number.
 */
CREATE OR REPLACE FUNCTION public.get_content_view_stats(
  p_content_type text,
  p_content_id uuid
)
RETURNS TABLE (
  total_views      integer,
  recent_views_24h integer,
  trending_score   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(
      CASE p_content_type
        WHEN 'event'      THEN (SELECT e.view_count FROM public.events e WHERE e.id = p_content_id)
        WHEN 'restaurant' THEN (SELECT r.view_count FROM public.restaurants r WHERE r.id = p_content_id)
        ELSE NULL
      END,
      0
    )::integer AS total_views,
    0::integer AS recent_views_24h,
    0::numeric AS trending_score;
$$;

-- Anonymous visitors are the point: an unauthenticated reader viewing an event
-- is a view. The definer's rights are what keep that from being a general write
-- grant on events or restaurants.
GRANT EXECUTE ON FUNCTION public.increment_event_view(uuid)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_restaurant_view(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_increment_views(uuid[])   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_view_stats(text, uuid) TO anon, authenticated;
