-- docs/page-plans/search.md WP5 item 6: the fuzzy fallback hides what the hub hides.
--
-- useEvents falls back to fuzzy_search_events when full-text search finds
-- nothing (src/hooks/useEvents.ts, the `fuzzy_search_events` rpc), and /search's
-- keyword leg reaches it that way. The function had no visibility predicates at
-- all, so a typo'd search could list merged duplicates, hidden rows, archived
-- rows and events from last year - every row the /events hub filters out.
--
-- The added predicates are the hub's, one for one:
--   is_merged / is_hidden / archived_at  applyEventVisibility (src/lib/eventQuery.ts)
--   upcoming                             upcomingOrFilter (eventsHubQuery.ts):
--                                        started today in Central, or has an
--                                        end_date still in the future.
-- "Today in Central" rather than now(): an event that started at 10am is still
-- on the hub's list at 9pm, and the fallback must not drop it.
--
-- BACKWARD COMPATIBILITY. CREATE OR REPLACE with the exact signature and
-- return columns of 20260822000004_repair_broken_rpcs.sql:58-99. No DROP, no
-- parameter change, no column removed. Callers get fewer rows, never a
-- different shape. Every column named here is in scripts/db-snapshot.json.

CREATE OR REPLACE FUNCTION public.fuzzy_search_events(search_query text, search_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, title text, description text, original_description text, enhanced_description text, ai_writeup text, date timestamp with time zone, category text, location text, venue text, latitude real, longitude real, image_url text, source_url text, price text, city text, relevance_score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Midnight at the start of today, America/Chicago, as a timestamptz.
  v_today_start timestamptz :=
    date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago';
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
    e.is_merged IS NOT TRUE
    AND e.is_hidden IS NOT TRUE
    AND e.archived_at IS NULL
    AND (e.date >= v_today_start OR e.end_date >= now())
    AND (
      e.title ILIKE '%' || search_query || '%'
      OR COALESCE(e.enhanced_description, '') ILIKE '%' || search_query || '%'
      OR COALESCE(e.original_description, '') ILIKE '%' || search_query || '%'
      OR COALESCE(e.venue, '') ILIKE '%' || search_query || '%'
      OR COALESCE(e.category, '') ILIKE '%' || search_query || '%'
    )
  ORDER BY relevance_score DESC
  LIMIT search_limit;
END;
$function$;

-- CREATE OR REPLACE keeps existing grants; restated so this file stands alone.
GRANT EXECUTE ON FUNCTION public.fuzzy_search_events(text, integer) TO anon, authenticated, service_role;
