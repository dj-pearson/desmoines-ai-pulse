-- WEB-QA-019: repair the three RPCs that EXIST but are broken.
--
-- This story is titled "25 RPC functions the web app calls do not exist". Checked
-- against pg_proc rather than by probing, it is 24 that do not exist -- and of the
-- five that DO, four were broken, each in a different way, every one failing
-- silently. get_active_ads was repaired earlier today (20260822000001). The other
-- three are here.
--
-- Measured by calling each with the exact argument shape its caller uses:
--   fuzzy_search_events        42703 'column e.description does not exist'
--   fuzzy_search_restaurants   42804 'Returned type real does not match expected
--                                     type numeric in column 6'
--   calculate_campaign_pricing PGRST203 'could not choose the best candidate'
--
-- 1. fuzzy_search_events (useEvents.ts:134) -- TWO defects, and the second was
--    hidden behind the first because Postgres reports only the first failure.
--    (a) The body selects and searches e.description. public.events HAS NO
--        description column; it has original_description and enhanced_description.
--        The same absent column that broke user-submission publishing in
--        WEB-QA-018. The declared output column  is kept so the
--        shape callers receive is unchanged, now fed by
--        COALESCE(enhanced_description, original_description) -- enhanced is what
--        the site displays, original is the fallback, matching how the crawler
--        populates both. Matching and relevance now consider BOTH columns, so a
--        query matching only the raw text still finds the row.
--    (b) It declares latitude/longitude as numeric; events.latitude and .longitude
--        are real. That is a 42804 waiting behind the 42703.
--
-- 2. fuzzy_search_restaurants (useRestaurants.ts:312) -- declares latitude and
--    longitude as numeric against real columns. latitude IS column 6, which is
--    exactly what the error named. restaurants.description exists, so that half is
--    fine, and rating really is numeric.
--
-- 3. calculate_campaign_pricing (useCampaigns.ts:142) -- two overloads exist,
--    (placement_type, integer) and (text, integer). Both take the same parameter
--    NAMES, so named arguments cannot disambiguate and every call is PGRST203.
--    Identical to the get_active_ads overload defect, which 20260718000001 fixed
--    for get_active_ads and only for get_active_ads. The superseded TEXT overload
--    is dropped on the same reasoning: with one candidate left, the existing call
--    resolves against the enum signature via implicit text->enum coercion, and
--    the placement strings clients send are all valid enum members.
--
-- WHY DROP + CREATE: CREATE OR REPLACE cannot alter a RETURNS TABLE signature.
-- check-migration-safety.mjs permits DROP FUNCTION IF EXISTS used to recreate.
--
-- BACKWARD COMPATIBILITY: all three currently fail on every call, so no client has
-- ever parsed a successful response. Restorative. Column names, column order and
-- argument signatures are unchanged, so useEvents, useRestaurants and useCampaigns
-- need no edit. Both fuzzy searches keep their unused (text, real, integer)
-- overload untouched -- nothing calls it and its parameter names differ, so it
-- cannot cause the PGRST203 that affects calculate_campaign_pricing.
--
-- Grants are re-applied because DROP discards them.


DROP FUNCTION IF EXISTS public.fuzzy_search_events(text, integer);

CREATE OR REPLACE FUNCTION public.fuzzy_search_events(search_query text, search_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, title text, description text, original_description text, enhanced_description text, ai_writeup text, date timestamp with time zone, category text, location text, venue text, latitude real, longitude real, image_url text, source_url text, price text, city text, relevance_score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    COALESCE(e.enhanced_description, e.original_description),
    e.original_description,
    e.enhanced_description,
    e.ai_writeup,
    e.date,
    e.category,
    e.location,
    e.venue,
    e.latitude,
    e.longitude,
    e.image_url,
    e.source_url,
    e.price,
    e.city,
    GREATEST(
      similarity(e.title, search_query),
      similarity(COALESCE(e.enhanced_description, ''), search_query),
      similarity(COALESCE(e.original_description, ''), search_query),
      similarity(COALESCE(e.venue, ''), search_query),
      similarity(COALESCE(e.category, ''), search_query)
    )::REAL as relevance_score
  FROM public.events e
  WHERE 
    e.title ILIKE '%' || search_query || '%'
    OR COALESCE(e.enhanced_description, '') ILIKE '%' || search_query || '%'
    OR COALESCE(e.original_description, '') ILIKE '%' || search_query || '%'
    OR COALESCE(e.venue, '') ILIKE '%' || search_query || '%'
    OR COALESCE(e.category, '') ILIKE '%' || search_query || '%'
  ORDER BY relevance_score DESC
  LIMIT search_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fuzzy_search_events(text, integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.fuzzy_search_restaurants(text, integer);

CREATE OR REPLACE FUNCTION public.fuzzy_search_restaurants(search_query text, search_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, description text, cuisine text, location text, latitude real, longitude real, phone text, website text, rating numeric, price_range text, image_url text, city text, relevance_score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    r.name ILIKE '%' || search_query || '%'
    OR COALESCE(r.description, '') ILIKE '%' || search_query || '%'
    OR COALESCE(r.cuisine, '') ILIKE '%' || search_query || '%'
    OR COALESCE(r.location, '') ILIKE '%' || search_query || '%'
  ORDER BY relevance_score DESC
  LIMIT search_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fuzzy_search_restaurants(text, integer) TO anon, authenticated, service_role;

-- Leaves the canonical (placement_type, integer) signature as the only candidate.
DROP FUNCTION IF EXISTS public.calculate_campaign_pricing(text, integer);

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'calculate_campaign_pricing';
  IF n > 1 THEN
    RAISE EXCEPTION 'calculate_campaign_pricing still has % overloads; PostgREST cannot disambiguate (PGRST203)', n;
  END IF;
END;
$$;
