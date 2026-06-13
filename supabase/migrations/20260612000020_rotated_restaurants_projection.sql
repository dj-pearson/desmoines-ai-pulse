-- WEB-PERF-001: column-projected list payloads.
--
-- The default restaurant browse path goes through get_rotated_restaurants,
-- which returns each row as `restaurant_data jsonb` (to_jsonb(r)) regardless of
-- any client-side .select() projection. That dragged the heavy detail-only
-- fields (seo_*, geo_summary/geo_key_facts/geo_faq, ai_writeup/writeup_*,
-- enhanced, source_url, plus the non-card geom/search_vector/data_quality_score/
-- google_place_id) into every /restaurants list response.
--
-- This re-creates the function VERBATIM (same signature → backward-safe) with a
-- single change: the row is serialized as `to_jsonb(r) - <heavy keys>` so those
-- columns never leave the database on the list path. The restaurant DETAIL page
-- runs its own select('*') and is unaffected; web consumers of the list only
-- read card + admin-list fields, all of which are retained.
--
-- Additive / idempotent: CREATE OR REPLACE, identical argument + return shape.

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
    WITH filtered AS (
        SELECT
            r.id,
            r.created_at,
            -- Strip heavy detail-only keys from the per-row payload (WEB-PERF-001).
            to_jsonb(r) - ARRAY[
                'ai_writeup',
                'enhanced',
                'geo_faq',
                'geo_key_facts',
                'geo_summary',
                'geom',
                'search_vector',
                'seo_description',
                'seo_h1',
                'seo_keywords',
                'seo_title',
                'source_url',
                'writeup_generated_at',
                'writeup_prompt_used',
                'data_quality_score',
                'google_place_id'
            ]::text[] AS data,
            NTILE(4) OVER (
                ORDER BY
                    COALESCE(r.popularity_score, 0) DESC,
                    r.is_featured DESC NULLS LAST
            ) AS pop_tier,
            COUNT(*) OVER () AS total
        FROM public.restaurants r
        WHERE
            r.is_merged = false
            AND (search_query IS NULL OR search_query = ''
                OR r.search_vector @@ websearch_to_tsquery('english', search_query))
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
        f.pop_tier ASC,
        hashtext(f.id::text || rotation_seed::text) ASC,
        f.created_at DESC
    LIMIT GREATEST(limit_count, 0)
    OFFSET GREATEST(offset_count, 0);
$$;
