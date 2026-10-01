-- IOS-DD-RESTAURANTS-15: the restaurant fuzzy fallback hides what the hub
-- hides, treats the typed text as text, and bounds its limit.
--
-- iOS Search, Map and the Dining tab (and the web's did-you-mean suggestions,
-- src/hooks/useRestaurants.ts) call fuzzy_search_restaurants when full-text
-- search finds nothing. As defined in 20260822000004_repair_broken_rpcs.sql it
-- had three problems:
--   * no is_merged predicate, so a typo'd search listed rows merged into a
--     duplicate, which the hub hides with .neq('is_merged', true)
--     (WEB-AUTO-005). 20260925000001 made the same fix for fuzzy_search_events.
--   * search_query went into ILIKE unescaped, so a '%' or '_' in the box
--     matched every row.
--   * LIMIT search_limit had no bound. The function is SECURITY DEFINER and
--     granted to anon, so any caller could ask for the whole table in one
--     request. Callers ask for 20 (iOS) and 10 (web SUGGESTION_LIMIT * 2), so a
--     cap of 50 changes nothing for them.
--
-- The LIKE pattern escapes '\' first, then '%' and '_', with ILIKE's default
-- escape character '\'. similarity() still sees the raw text; it has no
-- wildcards.
--
-- BACKWARD COMPATIBILITY. CREATE OR REPLACE with the exact signature and
-- return columns of 20260822000004_repair_broken_rpcs.sql:105-145. No DROP, no
-- parameter change, no column removed. Callers get fewer rows, never a
-- different shape. restaurants is public-read under RLS, so SECURITY DEFINER
-- exposes nothing new; it stays as it was, with the same search_path.
--
-- Timestamped after the latest migration in the repo rather than on the day
-- it was written, so `supabase db push` does not need --include-all.

CREATE OR REPLACE FUNCTION public.fuzzy_search_restaurants(search_query text, search_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, description text, cuisine text, location text, latitude real, longitude real, phone text, website text, rating numeric, price_range text, image_url text, city text, relevance_score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pattern text := '%' || replace(replace(replace(coalesce(search_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit integer := LEAST(GREATEST(COALESCE(search_limit, 50), 0), 50);
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.description,
    r.cuisine,
    r.location,
    r.latitude,
    r.longitude,
    r.phone,
    r.website,
    r.rating,
    r.price_range,
    r.image_url,
    r.city,
    GREATEST(
      similarity(r.name, search_query),
      similarity(COALESCE(r.description, ''), search_query),
      similarity(COALESCE(r.cuisine, ''), search_query),
      similarity(COALESCE(r.location, ''), search_query)
    )::REAL as relevance_score
  FROM public.restaurants r
  WHERE
    r.is_merged IS NOT TRUE
    AND (
      r.name ILIKE v_pattern
      OR COALESCE(r.description, '') ILIKE v_pattern
      OR COALESCE(r.cuisine, '') ILIKE v_pattern
      OR COALESCE(r.location, '') ILIKE v_pattern
    )
  ORDER BY relevance_score DESC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fuzzy_search_restaurants(text, integer) TO anon, authenticated, service_role;
