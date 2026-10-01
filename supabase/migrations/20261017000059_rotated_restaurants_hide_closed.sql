-- get_rotated_restaurants: leave permanently closed places out of the browse
-- list (SEO-059).
--
-- 20260930000001 sorted closed rows to the end of the rotation but still
-- returned them, so the /restaurants hub and the apps paged through closed
-- places after the open ones, and counted them in total_count. A list that
-- sends a reader to a place that has shut is the complaint SEO-059 fixes.
--
-- One change to 20260930000001, nothing else: WITHOUT a search, rows that
-- have closed for good (status 'closed', or Google's business_status
-- CLOSED_PERMANENTLY) are filtered out, so total_count and the pages agree.
-- WITH a search they stay, ranked by match first as before: someone who types
-- a name should find out that the place closed, and the detail page and cards
-- say so. Not-yet-open rows (opening_soon, announced) are unchanged: they stay
-- and sort after the open ones.
--
-- Backward compatibility (CLAUDE.md): same signature, same parameter defaults,
-- same RETURNS TABLE, same projection. The only visible difference is fewer
-- rows when no search is given; the iOS and Android lists already label and
-- sink closed rows, so they lose rows they were burying anyway.

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
            -- SEO-059: browsing never lists a place that has closed for good;
            -- a search by name still finds it.
            AND (
                q.tsq IS NOT NULL
                OR (
                    COALESCE(lower(r.status), '') NOT IN ('closed', 'permanently_closed', 'closed_permanently')
                    AND COALESCE(upper(r.business_status), '') <> 'CLOSED_PERMANENTLY'
                )
            )
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
        f.match_rank DESC,
        f.visit_rank ASC,
        f.pop_tier ASC,
        hashtext(f.id::text || rotation_seed::text) ASC,
        f.created_at DESC
    LIMIT GREATEST(limit_count, 0)
    OFFSET GREATEST(offset_count, 0);
$$;

COMMENT ON FUNCTION public.get_rotated_restaurants(integer, text, text[], text[], text[], real, real, boolean, integer, integer) IS
  'Tier-rotated restaurant listings. Merged rows are excluded; without a '
  'search, permanently closed rows (status closed or business_status '
  'CLOSED_PERMANENTLY) are excluded too (SEO-059); not-yet-open rows sort '
  'last; search_query matches every word with the last as a prefix and ranks '
  'by ts_rank. Returns a LIST projection (no SEO, GEO, tsvector, geometry or '
  'prompt-audit columns). total_count is the unpaginated match count.';
