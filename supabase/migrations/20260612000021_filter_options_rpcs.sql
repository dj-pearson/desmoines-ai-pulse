-- WEB-PERF-002: Read-only DISTINCT-value RPCs for filter dropdowns.
--
-- Filter UIs previously fetched whole columns (every restaurant's cuisine, every
-- restaurant's location, every future event's category) and deduped client-side,
-- dragging the entire table down the wire just to populate a dropdown. These
-- STABLE reader functions compute the DISTINCT set server-side so the client gets
-- only the handful of option strings it renders.
--
-- All functions are SECURITY INVOKER (default) so the caller's RLS still applies
-- exactly as it did for the old `.select(col)` reads — restaurants/events are
-- public-read, so anon + authenticated both work. search_path is pinned per the
-- project's SECURITY function convention. Additive + idempotent (CREATE OR REPLACE).

-- DISTINCT cuisines + locations for the restaurant filter dropdowns.
-- Returns one row; the client reads two text[] columns. Mirrors the prior two
-- `.select("cuisine"/"location").not(..., is, null)` fetches (no is_merged filter,
-- so the option set is identical to what the UI rendered before).
CREATE OR REPLACE FUNCTION public.get_restaurant_filter_options()
RETURNS TABLE (cuisines text[], locations text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(
      (SELECT array_agg(c ORDER BY c)
         FROM (SELECT DISTINCT cuisine AS c FROM public.restaurants
                WHERE cuisine IS NOT NULL AND cuisine <> '') s),
      ARRAY[]::text[]
    ) AS cuisines,
    COALESCE(
      (SELECT array_agg(l ORDER BY l)
         FROM (SELECT DISTINCT location AS l FROM public.restaurants
                WHERE location IS NOT NULL AND location <> '') s),
      ARRAY[]::text[]
    ) AS locations;
$$;

-- Cuisine -> count for the "Browse by Cuisine" section (replaces the full-column
-- fetch + client-side tally). Ordered by count desc to match the prior sort.
CREATE OR REPLACE FUNCTION public.get_cuisine_counts()
RETURNS TABLE (cuisine text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT cuisine, COUNT(*) AS count
    FROM public.restaurants
   WHERE cuisine IS NOT NULL AND cuisine <> ''
   GROUP BY cuisine
   ORDER BY COUNT(*) DESC, cuisine ASC;
$$;

-- DISTINCT categories across FUTURE events (matches SearchSection's prior
-- `.select("category").gte("date", today)` fetch).
CREATE OR REPLACE FUNCTION public.get_event_categories()
RETURNS TABLE (category text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT category
    FROM public.events
   WHERE category IS NOT NULL AND category <> ''
     -- cast both sides to text so this works whether `date` is a date or text
     -- column; ISO 'YYYY-MM-DD' text ordering is chronological.
     AND (date)::text >= (now() AT TIME ZONE 'America/Chicago')::date::text
   ORDER BY category ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_filter_options() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cuisine_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_categories() TO anon, authenticated;
