-- WEB-AUTO-005: duplicate detection + merge — additive lifecycle columns.
--
-- A merged "loser" row is RETAINED (not hard-deleted) so a merge is reversible
-- for 30 days. is_merged is the public-visibility flag (browse hooks add
-- `.neq('is_merged', true)`); merged_into points at the surviving row; merged_at
-- stamps when it happened.
--
-- BACKWARD COMPAT (CLAUDE.md): all columns are nullable / default-false, so old
-- web + shipped mobile binaries that never read them are unaffected. merged_into
-- is a plain uuid (NO foreign key) on purpose — the generic FK-repoint loop in
-- merge_duplicate_content() must NOT treat it as a child reference to repoint.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_merged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into UUID,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_merged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into UUID,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

-- Partial indexes keep the common "not merged" browse filter cheap.
CREATE INDEX IF NOT EXISTS idx_events_not_merged
  ON events (id) WHERE is_merged = false;

CREATE INDEX IF NOT EXISTS idx_restaurants_not_merged
  ON restaurants (id) WHERE is_merged = false;

-- The default restaurant browse path goes through get_rotated_restaurants
-- (returns full rows regardless of any client projection), so the merged-loser
-- filter has to live INSIDE the RPC. Re-create it verbatim with an added
-- `is_merged = false` guard (same signature → backward-safe).
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
