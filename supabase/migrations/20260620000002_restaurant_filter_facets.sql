-- WEB-PERF-002: server-side DISTINCT filter facets for restaurants.
-- The web previously fetched the entire `cuisine` and `location` columns (one
-- row per restaurant) just to dedupe/count client-side. This read-only function
-- returns the distinct values (cuisines with counts, sorted; distinct locations,
-- sorted) in a single small JSON payload. Additive + safe.

CREATE OR REPLACE FUNCTION public.get_restaurant_filter_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'cuisines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cuisine', cuisine, 'count', cnt) ORDER BY cnt DESC, cuisine)
      FROM (
        SELECT cuisine, COUNT(*)::int AS cnt
        FROM public.restaurants
        WHERE cuisine IS NOT NULL AND cuisine <> ''
        GROUP BY cuisine
      ) c
    ), '[]'::jsonb),
    'locations', COALESCE((
      SELECT jsonb_agg(DISTINCT location ORDER BY location)
      FROM public.restaurants
      WHERE location IS NOT NULL AND location <> ''
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_filter_facets() TO anon, authenticated;
