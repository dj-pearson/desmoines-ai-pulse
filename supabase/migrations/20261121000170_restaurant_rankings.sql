-- WEB-BE-076: the orderings behind "best", "recommended" and the nightly social
-- pick, rebuilt on facts the table holds.
--
-- WHAT WAS WRONG
--   popularity_score was backfilled by 20250729030647 with a "review count"
--   made of RANDOM(), recomputed only when rating or is_featured changed (and
--   then from view_count, which nothing increments for restaurants), never
--   decayed, and 0 on every row inserted since. It breaks ties on the hub's
--   rating and price sorts, it was the order a text search came back in, and
--   social-daily-poster picks the day's restaurant by it.
--   is_featured stayed on rows whose sponsorship had ended: WEB-BE-040 kept
--   every featured row with a sponsorship link, and nothing ever cleared it.
--
-- WHAT THIS ADDS (additive only, per CLAUDE.md):
--   restaurant_popularity_score()   the formula, written out below, no random
--                                   term. Pure: same inputs, same score.
--   refresh_restaurant_rankings()   nightly: clears featuring that came from a
--                                   sponsorship which is no longer active, then
--                                   recomputes popularity_score for every row
--                                   whose score moved. Pure SQL, scheduled with
--                                   pg_cron, no credentials.
--   restaurants.featured_source     'admin' or 'sponsorship', null when not
--                                   featured. Kept in step by a trigger.
--   search_restaurants_by_relevance()
--                                   the hub's text search ordered by ts_rank,
--                                   so a search on the default sort is ordered
--                                   by how well it matches, not by popularity.
--   update_restaurant_popularity    replaced in place (same name, same
--                                   trigger): recomputes from the new formula,
--                                   and leaves updated_at alone when the score
--                                   is the only thing that changed, so the
--                                   nightly job does not move every row's
--                                   sitemap lastmod.
--
-- calculate_restaurant_popularity_score (the old formula) is left in place and
-- no longer called; dropping it is a later release's job.

-- ---------------------------------------------------------------------------
-- 1. The formula.
-- ---------------------------------------------------------------------------
--
-- popularity_score, 0 to 100, integer:
--
--   quality    0-50  Google rating shrunk toward 3.5 by its review count:
--                      adjusted = (25 * 3.5 + n * rating) / (25 + n)
--                      quality  = 50 * (adjusted - 1) / 4
--                    25 is the review-count floor the top-rated list uses
--                    (owner decision, src/lib/restaurantRanking.ts). A 5.0 from
--                    four reviews scores about 34 here; a 4.8 from 3,000 about
--                    47. No rating scores 0. A rating with no stored count is
--                    treated as n = 0, so it counts as the prior and no more.
--   reach      0-25  25 * min(1, ln(1 + n) / ln(2001)): Google's review count
--                    on a log scale, full marks at 2,000 reviews.
--   views      0-15  15 * min(1, ln(1 + v) / ln(501)): detail-page views in the
--                    last 90 days from content_metrics (content_type
--                    'restaurant', metric_type 'view', written by
--                    log-content-metrics from useContentTracking on
--                    RestaurantDetails). Full marks at 500. restaurants.view_count
--                    is not used: nothing increments it.
--   freshness  0-10  10 * (1 - days since hours_checked_at / 90), floored at 0:
--                    how recently bulk-update-restaurants asked Google about the
--                    place. Never checked scores 0.
--
-- Featuring and sponsorship are NOT in the score: they are placements, and the
-- hub already orders featured rows with their own column where it means to.
CREATE OR REPLACE FUNCTION public.restaurant_popularity_score(
  p_rating numeric,
  p_review_count integer,
  p_views_90d integer,
  p_hours_checked_at timestamptz,
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT LEAST(100, GREATEST(0, round(
      CASE
        WHEN p_rating IS NULL OR p_rating <= 0 OR p_rating > 5 THEN 0
        ELSE 50 * (((25 * 3.5) + x.n * p_rating) / (25 + x.n) - 1) / 4
      END
    + 25 * LEAST(1, ln(1 + x.n) / ln(2001))
    + 15 * LEAST(1, ln(1 + x.v) / ln(501))
    + CASE
        WHEN p_hours_checked_at IS NULL THEN 0
        ELSE 10 * LEAST(1, GREATEST(0,
               1 - extract(epoch FROM (p_now - p_hours_checked_at)) / (90 * 86400)))
      END
  )))::integer
  FROM (
    SELECT GREATEST(COALESCE(p_review_count, 0), 0)::numeric AS n,
           GREATEST(COALESCE(p_views_90d, 0), 0)::numeric AS v
  ) x;
$$;

COMMENT ON FUNCTION public.restaurant_popularity_score(numeric, integer, integer, timestamptz, timestamptz) IS
  'WEB-BE-076: popularity_score from Google rating shrunk by review count (0-50), review count (0-25), 90-day detail views (0-15) and hours-check freshness (0-10). No random term. Formula documented in migration 20261121000170.';

-- Views of one restaurant in the 90 days before p_now.
CREATE OR REPLACE FUNCTION public.restaurant_views_90d(p_id uuid, p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(sum(cm.metric_value), 0)::integer
    FROM public.content_metrics cm
   WHERE cm.content_type = 'restaurant'
     AND cm.metric_type = 'view'
     AND cm.content_id = p_id
     AND cm.date >= (p_now - interval '90 days')::date;
$$;

-- ---------------------------------------------------------------------------
-- 2. Who featured a row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS featured_source text;

DO $$ BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_featured_source_known
    CHECK (featured_source IS NULL OR featured_source IN ('admin', 'sponsorship'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.restaurants.featured_source IS
  'WEB-BE-076: why is_featured is true. admin = an admin ticked it and it stays until an admin clears it; sponsorship = it came with a sponsorship and refresh_restaurant_rankings clears it once the sponsorship is no longer active. Null when not featured.';

-- Backfill. A featured row with any sponsorship trace (is_sponsored, a
-- sponsored_until, or a campaign link) is counted as sponsorship-featured:
-- WEB-BE-040 kept exactly those and cleared every other one, so a featured row
-- with no trace was ticked by an admin since. A sponsored row an admin also
-- featured cannot be told apart and is counted as sponsorship; re-ticking it
-- after the sponsorship ends makes it 'admin'.
UPDATE public.restaurants r
   SET featured_source = CASE
         WHEN r.is_sponsored IS TRUE
           OR r.sponsored_until IS NOT NULL
           OR EXISTS (SELECT 1 FROM public.sponsored_listing_links l
                       WHERE l.listing_type = 'restaurant' AND l.listing_id = r.id)
         THEN 'sponsorship'
         ELSE 'admin'
       END
 WHERE r.is_featured IS TRUE
   AND r.featured_source IS NULL;

-- Keep featured_source in step with is_featured. A write that turns featuring
-- on without naming a source is the admin checkbox (the only writer: every
-- ingest path inserts is_featured false, WEB-BE-040), so it records 'admin'.
-- A writer that means a sponsorship sets featured_source = 'sponsorship' in the
-- same statement.
CREATE OR REPLACE FUNCTION public.restaurants_featured_source_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_featured IS NOT TRUE THEN
    NEW.featured_source := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.featured_source := COALESCE(NEW.featured_source, 'admin');
  ELSIF OLD.is_featured IS NOT TRUE
        AND NEW.featured_source IS NOT DISTINCT FROM OLD.featured_source THEN
    NEW.featured_source := 'admin';
  ELSIF NEW.featured_source IS NULL THEN
    NEW.featured_source := 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurants_featured_source_sync ON public.restaurants;
CREATE TRIGGER restaurants_featured_source_sync
  BEFORE INSERT OR UPDATE OF is_featured, featured_source ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.restaurants_featured_source_sync();

-- ---------------------------------------------------------------------------
-- 3. The row trigger, on the new formula.
-- ---------------------------------------------------------------------------
-- Same function name and trigger as 20250728200000, so nothing else changes.
-- Recomputes when an input the row carries changes (rating, review count,
-- hours check); views move nightly. updated_at still moves on every UPDATE
-- except one whose only change is popularity_score, which is bookkeeping.
CREATE OR REPLACE FUNCTION public.update_restaurant_popularity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.rating IS DISTINCT FROM NEW.rating
     OR OLD.google_review_count IS DISTINCT FROM NEW.google_review_count
     OR OLD.hours_checked_at IS DISTINCT FROM NEW.hours_checked_at THEN
    NEW.popularity_score := public.restaurant_popularity_score(
      NEW.rating,
      NEW.google_review_count,
      public.restaurant_views_90d(NEW.id),
      NEW.hours_checked_at
    );
  END IF;

  IF OLD.popularity_score IS DISTINCT FROM NEW.popularity_score
     AND (to_jsonb(NEW) - 'popularity_score' - 'updated_at')
         = (to_jsonb(OLD) - 'popularity_score' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The nightly job.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_restaurant_rankings(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cleared integer := 0;
  v_scored integer := 0;
BEGIN
  -- Featuring that came with a sponsorship ends with it. Active means what
  -- isSponsoredActive means in the browser: is_sponsored, and either no
  -- expiry or one still ahead.
  UPDATE public.restaurants r
     SET is_featured = false
   WHERE r.is_featured IS TRUE
     AND r.featured_source = 'sponsorship'
     AND NOT (r.is_sponsored IS TRUE
              AND (r.sponsored_until IS NULL OR r.sponsored_until > p_now));
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  WITH views AS (
    SELECT cm.content_id, sum(cm.metric_value)::integer AS v
      FROM public.content_metrics cm
     WHERE cm.content_type = 'restaurant'
       AND cm.metric_type = 'view'
       AND cm.date >= (p_now - interval '90 days')::date
     GROUP BY cm.content_id
  ),
  scored AS (
    SELECT r.id,
           public.restaurant_popularity_score(
             r.rating, r.google_review_count, COALESCE(v.v, 0), r.hours_checked_at, p_now
           ) AS score
      FROM public.restaurants r
      LEFT JOIN views v ON v.content_id = r.id
  )
  UPDATE public.restaurants r
     SET popularity_score = s.score
    FROM scored s
   WHERE r.id = s.id
     AND r.popularity_score IS DISTINCT FROM s.score;
  GET DIAGNOSTICS v_scored = ROW_COUNT;

  RETURN jsonb_build_object('featured_cleared', v_cleared, 'popularity_updated', v_scored);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_restaurant_rankings(timestamptz) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.refresh_restaurant_rankings(timestamptz) FROM anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.refresh_restaurant_rankings(timestamptz) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION public.refresh_restaurant_rankings(timestamptz) IS
  'WEB-BE-076: nightly. Clears is_featured where featured_source = sponsorship and the sponsorship is no longer active, then recomputes popularity_score with restaurant_popularity_score for rows whose score moved. Returns the two counts.';

-- Replace the RANDOM()-seeded scores now rather than at the first cron run.
SELECT public.refresh_restaurant_rankings();

DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron';
    ELSE
      RAISE NOTICE 'pg_cron unavailable; skipping restaurant-rankings-nightly';
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restaurant-rankings-nightly') THEN
    PERFORM cron.unschedule('restaurant-rankings-nightly');
  END IF;

  -- 08:17 UTC, about 2-3 AM Central, after the evening's Places refreshes.
  PERFORM cron.schedule(
    'restaurant-rankings-nightly',
    '17 8 * * *',
    'SELECT public.refresh_restaurant_rankings();'
  );
END
$cron$;

-- ---------------------------------------------------------------------------
-- 5. Text search by relevance.
-- ---------------------------------------------------------------------------
-- The hub sends the tsquery it already builds (src/lib/eventSearchQuery.ts:
-- prefix to_tsquery, or websearch for quotes and OR) and applies its other
-- filters, the projection and the page window on top, as PostgREST does for
-- any set-returning function. The rows come back best match first, then by
-- name; the caller adds no ORDER BY, so that order is the page order.
-- SECURITY INVOKER: the restaurants read policy applies as for a table read.
CREATE OR REPLACE FUNCTION public.search_restaurants_by_relevance(
  search_query text,
  use_websearch boolean DEFAULT false
)
RETURNS SETOF public.restaurants
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT CASE
             WHEN COALESCE(btrim(search_query), '') = '' THEN NULL
             WHEN use_websearch THEN websearch_to_tsquery('english', search_query)
             ELSE to_tsquery('english', search_query)
           END AS tsq
  )
  SELECT r.*
    FROM public.restaurants r, q
   WHERE q.tsq IS NOT NULL
     AND r.search_vector @@ q.tsq
   ORDER BY ts_rank(r.search_vector, q.tsq) DESC, r.name ASC, r.id ASC;
$$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.search_restaurants_by_relevance(text, boolean) TO anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION public.search_restaurants_by_relevance(text, boolean) IS
  'WEB-BE-076: restaurants matching a tsquery, best ts_rank first then name. The /restaurants hub calls it for a search on the default sort and applies its filters and paging on top.';
