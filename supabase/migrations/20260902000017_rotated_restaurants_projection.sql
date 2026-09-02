-- WEB-PERF-029: the restaurants hub downloads every column of ~480 rows.
--
-- get_rotated_restaurants returns `to_jsonb(r)` -- the WHOLE ROW -- and
-- useRestaurants asks for limit 1000, while Restaurants.tsx then paginates 30
-- at a time in the browser. So a visitor who looks at the first page pays for
-- every restaurant in the database, including the columns nothing on a list
-- card renders: four SEO fields, three GEO fields, the AI prompt audit trail,
-- the tsvector and the PostGIS geometry blob.
--
-- The WEB-PERF-001/009 projection already exists and already fixed this -- but
-- only on the FALLBACK query path. The default sort goes through this RPC,
-- which is to say the projection applied to the path almost nobody takes.
--
-- A DENY-LIST, NOT AN ALLOW-LIST, and the choice matters for the mobile
-- clients. An allow-list drops any column added later, silently, on the day it
-- is added -- and iOS and Android read this RPC too, decoding into models this
-- repo does not control the release cycle of. Subtracting the known-heavy keys
-- means a new column keeps flowing to every caller, and the only rows that ever
-- disappear are the ones named here.
--
-- Additive per CLAUDE.md: same signature, same return type, and every key
-- removed is one no shipped client reads (checked against the iOS and Android
-- models before writing this).

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
            -- The list payload. Keys removed are the ones listed in
            -- src/lib/listColumns.ts as never rendered on a card:
            --   seo_title / seo_description / seo_keywords / seo_h1
            --   geo_summary / geo_key_facts / geo_faq
            --   search_vector (a tsvector), geom (PostGIS), writeup_prompt_used
            -- Everything else, present and future, still comes through.
            (to_jsonb(r)
                - 'seo_title' - 'seo_description' - 'seo_keywords' - 'seo_h1'
                - 'geo_summary' - 'geo_key_facts' - 'geo_faq'
                - 'search_vector' - 'geom' - 'writeup_prompt_used'
            ) AS data,
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

COMMENT ON FUNCTION public.get_rotated_restaurants(integer, text, text[], text[], text[], real, real, boolean, integer, integer) IS
  'Tier-rotated restaurant listings. Returns a LIST projection: the SEO, GEO, '
  'tsvector, geometry and prompt-audit columns are removed because no list card '
  'renders them. total_count is the unpaginated match count. WEB-PERF-029.';
