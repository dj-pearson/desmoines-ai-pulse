-- WEB-PERF-002: server-side DISTINCT filter options for restaurants.
--
-- Replaces client-side full-column fetches (useRestaurants useCuisineCounts /
-- useRestaurantFilterOptions pulled every cuisine + location row just to dedupe
-- in JS). This read-only function returns the distinct sets (with cuisine
-- counts) in one cheap call. Additive — safe in a single release.

CREATE OR REPLACE FUNCTION public.get_restaurant_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cuisines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cuisine', cuisine, 'count', cnt)
                       ORDER BY cnt DESC)
      FROM (
        SELECT cuisine, count(*)::int AS cnt
        FROM public.restaurants
        WHERE cuisine IS NOT NULL
          AND cuisine <> ''
          AND is_merged IS DISTINCT FROM true
        GROUP BY cuisine
      ) c
    ), '[]'::jsonb),
    'locations', COALESCE((
      SELECT jsonb_agg(DISTINCT location ORDER BY location)
      FROM public.restaurants
      WHERE location IS NOT NULL
        AND location <> ''
        AND is_merged IS DISTINCT FROM true
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_filter_options() TO anon, authenticated;

COMMENT ON FUNCTION public.get_restaurant_filter_options() IS
  'WEB-PERF-002: distinct cuisines (with counts) + locations for restaurant filter UI.';
