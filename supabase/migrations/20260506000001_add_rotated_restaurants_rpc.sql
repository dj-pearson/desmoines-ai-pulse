-- Tier-based rotated restaurant listings.
--
-- The default "popularity" sort always ordered by popularity_score DESC, which
-- meant the same ~20 restaurants showed at the top of the page every visit.
-- This RPC instead bucket-ranks restaurants into 4 popularity tiers (NTILE)
-- and deterministically shuffles within each tier using a caller-supplied
-- seed. Top-tier restaurants stay near the top, but which specific ones
-- appear first rotates with the seed (clients pass a per-day or per-session
-- value), so users see different popular places each time the page loads.
--
-- The same seed always produces the same ordering, so pagination is stable
-- for the duration of a session.
--
-- Each row carries the total filtered count via a window function so callers
-- can paginate without a second round-trip.

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
            to_jsonb(r) AS data,
            NTILE(4) OVER (
                ORDER BY
                    COALESCE(r.popularity_score, 0) DESC,
                    r.is_featured DESC NULLS LAST
            ) AS pop_tier,
            COUNT(*) OVER () AS total
        FROM public.restaurants r
        WHERE
            (search_query IS NULL OR search_query = ''
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

GRANT EXECUTE ON FUNCTION public.get_rotated_restaurants(
    integer, text, text[], text[], text[], real, real, boolean, integer, integer
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_rotated_restaurants IS
'Returns restaurants bucketed into 4 popularity tiers (NTILE), shuffled deterministically inside each tier via hashtext(id || seed). Pass a stable per-day seed so the top of the list rotates instead of always showing the same first restaurants. Each row includes total_count (the unpaginated filtered total) so callers can paginate without a second query.';
