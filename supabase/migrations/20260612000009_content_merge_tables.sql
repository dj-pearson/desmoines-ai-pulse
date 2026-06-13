-- WEB-AUTO-005: duplicate detection — queue + audit tables and the detection RPCs.

-- ===========================================================================
-- 1. Merge-review queue (ambiguous 0.7–0.9 pairs awaiting an admin decision)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS content_merge_candidates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type      TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant')),
  -- a_id is always the lexicographically-smaller uuid so a pair has ONE row.
  a_id              UUID NOT NULL,
  b_id              UUID NOT NULL,
  suggested_survivor UUID NOT NULL,
  name_sim          REAL NOT NULL,
  distance_m        DOUBLE PRECISION,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'merged', 'dismissed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID,
  UNIQUE (content_type, a_id, b_id)
);

CREATE INDEX IF NOT EXISTS idx_content_merge_candidates_pending
  ON content_merge_candidates (content_type, name_sim DESC)
  WHERE status = 'pending';

ALTER TABLE content_merge_candidates ENABLE ROW LEVEL SECURITY;

-- Admin-read only; all writes go through the SECURITY DEFINER RPCs / service role.
DO $$ BEGIN
  CREATE POLICY "Admins read merge candidates" ON content_merge_candidates
    FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================================================
-- 2. Immutable merge audit trail (drives 30-day reversibility)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS content_merges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant')),
  survivor_id   UUID NOT NULL,
  loser_id      UUID NOT NULL,
  confidence    REAL,
  reason        TEXT,
  auto          BOOLEAN NOT NULL DEFAULT false,
  repointed     JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_by     UUID,
  reversed      BOOLEAN NOT NULL DEFAULT false,
  reversed_at   TIMESTAMPTZ,
  reversed_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_merges_loser
  ON content_merges (loser_id);
CREATE INDEX IF NOT EXISTS idx_content_merges_created
  ON content_merges (created_at DESC);

ALTER TABLE content_merges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins read merges" ON content_merges
    FOR SELECT USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================================================
-- 3. Detection RPCs — trigram-candidate self-joins.
--    Return EVERY pair above p_threshold with a computed distance + richness;
--    the dedupe-content edge fn applies the auto-merge vs queue gates so the
--    policy lives in one (testable) place.
--    `a.col % b.col` probes the GIN trigram index from migration 20250107000007.
--    Distance is plain-SQL haversine (metres) — no PostGIS dependency.
-- ===========================================================================

CREATE OR REPLACE FUNCTION find_duplicate_events(
  p_threshold REAL DEFAULT 0.7,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  a_id UUID, b_id UUID,
  name_sim REAL,
  distance_m DOUBLE PRECISION,
  same_date BOOLEAN,
  richness_a INTEGER, richness_b INTEGER,
  title_a TEXT, title_b TEXT
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    e1.id, e2.id,
    similarity(e1.title, e2.title) AS name_sim,
    CASE
      WHEN e1.latitude IS NOT NULL AND e1.longitude IS NOT NULL
       AND e2.latitude IS NOT NULL AND e2.longitude IS NOT NULL
      THEN 6371000 * acos(least(1, greatest(-1,
        cos(radians(e1.latitude)) * cos(radians(e2.latitude))
          * cos(radians(e2.longitude) - radians(e1.longitude))
        + sin(radians(e1.latitude)) * sin(radians(e2.latitude))
      )))
    END AS distance_m,
    (e1.date::date = e2.date::date) AS same_date,
    ( (e1.image_url IS NOT NULL)::int
      + (COALESCE(e1.enhanced_description, e1.original_description) IS NOT NULL)::int
      + (e1.seo_title IS NOT NULL)::int
      + (e1.latitude IS NOT NULL)::int
      + (e1.source_url IS NOT NULL)::int
      + (e1.price IS NOT NULL)::int ) AS richness_a,
    ( (e2.image_url IS NOT NULL)::int
      + (COALESCE(e2.enhanced_description, e2.original_description) IS NOT NULL)::int
      + (e2.seo_title IS NOT NULL)::int
      + (e2.latitude IS NOT NULL)::int
      + (e2.source_url IS NOT NULL)::int
      + (e2.price IS NOT NULL)::int ) AS richness_b,
    e1.title, e2.title
  FROM events e1
  JOIN events e2
    ON e1.id < e2.id
   AND e1.title % e2.title
   AND e1.date::date = e2.date::date
  WHERE e1.is_merged = false
    AND e2.is_merged = false
    AND e1.date >= CURRENT_DATE - INTERVAL '1 day'
    AND e2.date >= CURRENT_DATE - INTERVAL '1 day'
    AND similarity(e1.title, e2.title) >= p_threshold
  ORDER BY similarity(e1.title, e2.title) DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION find_duplicate_restaurants(
  p_threshold REAL DEFAULT 0.7,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  a_id UUID, b_id UUID,
  name_sim REAL,
  distance_m DOUBLE PRECISION,
  same_date BOOLEAN,
  richness_a INTEGER, richness_b INTEGER,
  title_a TEXT, title_b TEXT
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    r1.id, r2.id,
    similarity(r1.name, r2.name) AS name_sim,
    CASE
      WHEN r1.latitude IS NOT NULL AND r1.longitude IS NOT NULL
       AND r2.latitude IS NOT NULL AND r2.longitude IS NOT NULL
      THEN 6371000 * acos(least(1, greatest(-1,
        cos(radians(r1.latitude)) * cos(radians(r2.latitude))
          * cos(radians(r2.longitude) - radians(r1.longitude))
        + sin(radians(r1.latitude)) * sin(radians(r2.latitude))
      )))
    END AS distance_m,
    NULL::boolean AS same_date,
    ( (r1.image_url IS NOT NULL)::int
      + (r1.description IS NOT NULL)::int
      + (r1.rating IS NOT NULL)::int
      + (r1.cuisine IS NOT NULL)::int
      + (r1.latitude IS NOT NULL)::int
      + (r1.website IS NOT NULL)::int
      + (r1.phone IS NOT NULL)::int ) AS richness_a,
    ( (r2.image_url IS NOT NULL)::int
      + (r2.description IS NOT NULL)::int
      + (r2.rating IS NOT NULL)::int
      + (r2.cuisine IS NOT NULL)::int
      + (r2.latitude IS NOT NULL)::int
      + (r2.website IS NOT NULL)::int
      + (r2.phone IS NOT NULL)::int ) AS richness_b,
    r1.name, r2.name
  FROM restaurants r1
  JOIN restaurants r2
    ON r1.id < r2.id
   AND r1.name % r2.name
  WHERE r1.is_merged = false
    AND r2.is_merged = false
    AND similarity(r1.name, r2.name) >= p_threshold
  ORDER BY similarity(r1.name, r2.name) DESC
  LIMIT p_limit;
$$;

-- Read-only detection: admin (dashboard "Run scan" preview) + service role (cron).
REVOKE ALL ON FUNCTION find_duplicate_events(REAL, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_duplicate_restaurants(REAL, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_duplicate_events(REAL, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION find_duplicate_restaurants(REAL, INTEGER) TO authenticated, service_role;
