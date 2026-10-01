-- IOS-DD-SEARCH-02: the event fuzzy fallback treats the typed text as text,
-- bounds its limit, and tolerates a typo.
--
-- iOS Search and the Home feed (and the web's useEvents fallback) call
-- fuzzy_search_events when full-text search finds nothing. As defined in
-- 20260925000001_fuzzy_search_events_visibility.sql it had three problems:
--   * search_query went into five ILIKEs unescaped, so a '%' or '_' in the
--     box matched every upcoming row.
--   * LIMIT search_limit had no bound. The function is SECURITY DEFINER and
--     granted to anon, so any caller could ask for every upcoming event in one
--     request. iOS asks for 20 and the web for 10, so a cap of 50 changes no
--     shipped client. 20261008000001 made the same two fixes for
--     fuzzy_search_restaurants.
--   * the match was substring-only, so "concrt" never found "concert" and the
--     "Did you mean" fallback could not do the one thing it is for. A
--     word_similarity arm (pg_trgm, already required by similarity() below)
--     now matches a mistyped word against the title or venue, for queries of
--     four characters or more so short input does not match half the table.
--
-- A query shorter than two characters (after trimming) returns no rows; the
-- iOS client never sends one and a one-letter substring match is noise.
--
-- The LIKE pattern escapes '\' first, then '%' and '_', with ILIKE's default
-- escape character '\'. similarity() still sees the trimmed raw text; it has
-- no wildcards.
--
-- BACKWARD COMPATIBILITY. CREATE OR REPLACE with the exact signature and
-- return columns of 20260925000001. No DROP, no parameter change, no column
-- removed. Callers get fewer or better rows, never a different shape. The
-- visibility and upcoming predicates are unchanged.
--
-- Verified by reading only: there is no database in the environment this was
-- written in.

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
  v_q text := btrim(coalesce(search_query, ''));
  v_pattern text := '%' || replace(replace(replace(btrim(coalesce(search_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit integer := LEAST(GREATEST(COALESCE(search_limit, 50), 0), 50);
BEGIN
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;

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
      similarity(e.title, v_q),
      similarity(COALESCE(e.enhanced_description, ''), v_q),
      similarity(COALESCE(e.original_description, ''), v_q),
      similarity(COALESCE(e.venue, ''), v_q),
      similarity(COALESCE(e.category, ''), v_q)
    )::REAL as relevance_score
  FROM public.events e
  WHERE
    e.is_merged IS NOT TRUE
    AND e.is_hidden IS NOT TRUE
    AND e.archived_at IS NULL
    AND (e.date >= v_today_start OR e.end_date >= now())
    AND (
      e.title ILIKE v_pattern
      OR COALESCE(e.enhanced_description, '') ILIKE v_pattern
      OR COALESCE(e.original_description, '') ILIKE v_pattern
      OR COALESCE(e.venue, '') ILIKE v_pattern
      OR COALESCE(e.category, '') ILIKE v_pattern
      OR (
        char_length(v_q) >= 4
        AND (
          word_similarity(v_q, e.title) >= 0.5
          OR word_similarity(v_q, COALESCE(e.venue, '')) >= 0.5
        )
      )
    )
  ORDER BY relevance_score DESC
  LIMIT v_limit;
END;
$function$;

-- CREATE OR REPLACE keeps existing grants; restated so this file stands alone.
GRANT EXECUTE ON FUNCTION public.fuzzy_search_events(text, integer) TO anon, authenticated, service_role;
