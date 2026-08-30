-- IOS-AUDIT-PERF-025: distinct filter-chip values, built server-side.
--
-- Three services each selected one column with no limit and de-duplicated in a
-- Swift Set: RestaurantsService.fetchAvailableCuisines / fetchAvailableLocations,
-- ArticlesService.fetchCategories, HotelsService.fetchAreas. Opening the filter
-- sheet downloaded one row per table record to end up with a few dozen strings.
--
-- HONEST ABOUT THE SIZE OF THE WIN TODAY: restaurants is 478 rows, articles 25,
-- hotels 63, so this is currently a few hundred rows saved, not a few hundred
-- thousand. It is worth doing because the cost is proportional to the table and
-- the result never is - the payload grows with every restaurant added while the
-- chip list stays at roughly a dozen cuisines. Fixing it at 478 rows is cheap;
-- fixing it at 50,000 is a support ticket.
--
-- ONE FUNCTION RATHER THAN FOUR, so a new chip source is one branch here instead
-- of a new migration, a new grant and a new client method. The source name is
-- matched against constants and never interpolated, so there is no dynamic SQL
-- and an unknown source returns zero rows rather than an error - a filter sheet
-- with no chips is a better failure than a filter sheet that will not open.
--
-- Additive: new function, nothing renamed, no policy touched. Old code paths
-- keep working for shipped binaries, per the CLAUDE.md deprecation flow.

/**
 * Distinct values for one filter-chip source, ordered for display.
 *
 * Trimmed and empty-filtered in SQL. Two of the three clients already did that
 * in Swift and one did not, so a whitespace-only cuisine would have rendered as
 * a blank chip on the Restaurants sheet. Doing it here makes all three agree.
 *
 * SECURITY DEFINER only to keep the plan stable across callers; every source
 * reads a publicly readable table under its own public-facing filter (published
 * articles, active hotels), so it exposes nothing an anon SELECT could not
 * already reach.
 */
CREATE OR REPLACE FUNCTION public.filter_values(p_source text)
RETURNS TABLE (value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT btrim(r.cuisine) AS value
  FROM public.restaurants r
  WHERE p_source = 'restaurant_cuisine'
    AND r.cuisine IS NOT NULL
    AND btrim(r.cuisine) <> ''

  UNION ALL

  SELECT DISTINCT btrim(r.location)
  FROM public.restaurants r
  WHERE p_source = 'restaurant_location'
    AND r.location IS NOT NULL
    AND btrim(r.location) <> ''

  UNION ALL

  SELECT DISTINCT btrim(a.category)
  FROM public.articles a
  WHERE p_source = 'article_category'
    AND a.status = 'published'
    AND a.category IS NOT NULL
    AND btrim(a.category) <> ''

  UNION ALL

  SELECT DISTINCT btrim(h.area)
  FROM public.hotels h
  WHERE p_source = 'hotel_area'
    AND h.is_active = true
    AND h.area IS NOT NULL
    AND btrim(h.area) <> ''

  ORDER BY 1;
$$;

-- Chip values are the filter UI itself; they are public wherever the listing is.
GRANT EXECUTE ON FUNCTION public.filter_values(text) TO anon, authenticated;

COMMENT ON FUNCTION public.filter_values(text) IS
  'Distinct filter-chip values for one source (IOS-AUDIT-PERF-025). Sources: restaurant_cuisine, restaurant_location, article_category, hotel_area. Unknown source returns zero rows.';
