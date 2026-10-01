-- get_rotated_restaurants: hide merged rows, list places you can't visit last,
-- and match the word being typed (eat-drink pass 2, WP5.9; first-pass D1).
--
-- WRITTEN, NOT APPLIED. Applying it is D-E1 in docs/page-plans/eat-drink-pass2.md.
--
-- Three changes to 20260902000017, nothing else:
--
-- 1. MERGED ROWS. The RPC never filtered is_merged, so the hub's default sort
--    counted and showed rows that dedupe-content had folded into another row,
--    while the legacy query path (useRestaurants.ts) hid them. The total and
--    the page disagreed depending on which path served them.
--
-- 2. CLOSED AND NOT-YET-OPEN LAST. A closed place, or one that is only
--    announced, could land in the first tier of the rotation above places
--    that are open tonight. They stay in the result (the hub labels them) but
--    sort after everything a visitor can walk into: opening_soon and announced
--    first, closed at the very end.
--
-- 3. PREFIX SEARCH, RANKED. websearch_to_tsquery needs whole words, so "harb"
--    found nothing while the autocomplete above it suggested Harbinger. The
--    query is now every typed word ANDed, with the last one as a prefix
--    ("harb" -> 'harb':*). Only letters and digits reach to_tsquery, so no
--    input can be a tsquery syntax error. With a search, rows sort by ts_rank
--    first so the best match leads (ahead of the closed-last rule, so a place
--    searched for by name is found even if it has closed); without one, the
--    rotation is unchanged apart from (2).
--
-- Backward compatibility (CLAUDE.md): same signature, same parameter defaults,
-- same RETURNS TABLE, same projection. The only visible difference is fewer
-- rows (merged ones) and a different order, which no client depends on.

CREATE OR REPLACE FUNCTION public.get_rotated_restaurants(
    rotation_seed integer DEFAULT 0,
    search_query text DEFAULT NULL,
    cuisine_filter text[] DEFAULT NULL,
    price_filter text[] DEFAULT NULL,
    location_filter text[] DEFAULT NULL,
    min_rating real DEFAULT NULL,
    max_rating real DEFAULT NULL,
    featured_only boolean DEFAULT FALSE,
    limit_count integer DEFAULT 30,
    offset_count integer DEFAULT 0
)
RETURNS TABLE (
    restaurant_data jsonb,
    total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH tokens AS (
        SELECT array_remove(
            regexp_split_to_array(
                lower(regexp_replace(COALESCE(search_query, ''), '[^A-Za-z0-9]+', ' ', 'g')),
                '\s+'
            ),
            ''
        ) AS words
    ),
    q AS (
        SELECT CASE
            WHEN cardinality(words) = 0 THEN NULL
            ELSE to_tsquery(
                'english',
                array_to_string(
                    words[1:cardinality(words) - 1] || (words[cardinality(words)] || ':*'),
                    ' & '
                )
            )
        END AS tsq
        FROM tokens
    ),
    filtered AS (
        SELECT
            r.id,
            r.created_at,
            -- Same deny-list projection as 20260902000017; see that file.
            (to_jsonb(r)
                - 'seo_title' - 'seo_description' - 'seo_keywords' - 'seo_h1'
                - 'geo_summary' - 'geo_key_facts' - 'geo_faq'
                - 'search_vector' - 'geom' - 'writeup_prompt_used'
            ) AS data,
            CASE
                WHEN r.status = 'closed' THEN 2
                WHEN r.status IN ('opening_soon', 'announced') THEN 1
                ELSE 0
            END AS visit_rank,
            CASE WHEN q.tsq IS NULL THEN 0 ELSE ts_rank(r.search_vector, q.tsq) END AS match_rank,
            NTILE(4) OVER (
                ORDER BY
                    COALESCE(r.popularity_score, 0) DESC,
                    r.is_featured DESC NULLS LAST
            ) AS pop_tier,
            COUNT(*) OVER () AS total
        FROM public.restaurants r
        CROSS JOIN q
        WHERE
            r.is_merged IS NOT TRUE
            AND (q.tsq IS NULL OR r.search_vector @@ q.tsq)
            AND (cuisine_filter IS NULL OR r.cuisine = ANY(cuisine_filter))
            AND (price_filter IS NULL OR r.price_range = ANY(price_filter))
            AND (location_filter IS NULL OR r.location = ANY(location_filter))
            AND (min_rating IS NULL OR r.rating >= min_rating)
            AND (max_rating IS NULL OR r.rating <= max_rating)
            AND (NOT featured_only OR r.is_featured = TRUE)
    )
    SELECT
        f.data AS restaurant_data,
        f.total::bigint AS total_count
    FROM filtered f
    ORDER BY
        -- match_rank is 0 for every row without a search, so this leads only
        -- when someone typed a name: a closed Harbinger searched for by name
        -- still comes first.
        f.match_rank DESC,
        f.visit_rank ASC,
        f.pop_tier ASC,
        hashtext(f.id::text || rotation_seed::text) ASC,
        f.created_at DESC
    LIMIT GREATEST(limit_count, 0)
    OFFSET GREATEST(offset_count, 0);
$$;

COMMENT ON FUNCTION public.get_rotated_restaurants(integer, text, text[], text[], text[], real, real, boolean, integer, integer) IS
  'Tier-rotated restaurant listings. Merged rows are excluded; closed, then '
  'not-yet-open rows sort last; search_query matches every word with the last '
  'as a prefix and ranks by ts_rank. Returns a LIST projection (no SEO, GEO, '
  'tsvector, geometry or prompt-audit columns). total_count is the unpaginated '
  'match count. WEB-PERF-029, eat-drink pass 2 WP5.9.';
