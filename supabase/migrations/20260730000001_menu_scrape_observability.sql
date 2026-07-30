-- Menu scraper observability + extraction metadata.
--
-- WHY
-- ---
-- When a restaurant's menu failed to scrape there was no record of what was
-- tried. The function logged to stdout and returned a single string per
-- restaurant ("AI could not extract menu items"), which is the same message
-- whether the site 403'd, rendered its menu in JavaScript, published it as a
-- PDF the fetch could not reach, or produced a menu that was rejected for
-- quality. Admins had no way to tell those apart, so nobody could fix the
-- fixable ones (usually: set menu_url).
--
-- This adds a per-attempt log and records how a published menu was obtained.
--
-- BACKWARD COMPATIBILITY (see CLAUDE.md → "Supabase Postgres")
-- ------------------------------------------------------------
-- Additive only, and safe in a single release:
--   * CREATE TABLE for a table no shipped client reads;
--   * ADD COLUMN ... NULL with no default on restaurant_menus, so no rewrite
--     and no change to what existing readers see.
-- Nothing is renamed, dropped, tightened, or made NOT NULL. The
-- source_type CHECK constraint is deliberately untouched — 'scraped' remains
-- the value the scraper writes, so older iOS/Android binaries reading
-- restaurant_menus continue to see exactly the shape they shipped against.

-- ----------------------------------------------------------------------------
-- 1. Extraction metadata on the published menu.
-- ----------------------------------------------------------------------------
ALTER TABLE restaurant_menus
  ADD COLUMN IF NOT EXISTS extraction_method TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS item_count INTEGER;

COMMENT ON COLUMN restaurant_menus.extraction_method IS
  'How this menu was obtained: jsonld | platform | pdf_vision | image_vision | html_text | merged. NULL for rows captured before this column existed.';
COMMENT ON COLUMN restaurant_menus.confidence IS
  'Quality score 0.000-1.000 from scoreExtraction() at capture time. Menus below 0.25 are never published.';
COMMENT ON COLUMN restaurant_menus.item_count IS
  'Denormalized count of restaurant_menu_items rows, for cheap admin listing.';

-- ----------------------------------------------------------------------------
-- 2. Per-attempt log.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_scrape_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- The URL actually tried: a page, a PDF, or the page images came from.
  url TEXT NOT NULL,
  -- Extraction path attempted. Free text rather than an enum so adding a new
  -- method later needs no migration and no enum-value deprecation dance.
  method TEXT NOT NULL,
  -- success  = published-quality result
  -- rejected = menu-shaped data that failed the quality gate
  -- empty    = source read fine, contained no menu
  -- error    = fetch or API failure
  -- skipped  = not worth an attempt (too few menu signals, no fetchable image)
  outcome TEXT NOT NULL,
  items_found INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin UI reads the newest attempts for one restaurant.
CREATE INDEX IF NOT EXISTS idx_menu_scrape_attempts_restaurant
  ON menu_scrape_attempts(restaurant_id, created_at DESC);

-- "Which failure modes are most common this week?"
CREATE INDEX IF NOT EXISTS idx_menu_scrape_attempts_outcome
  ON menu_scrape_attempts(outcome, created_at DESC);

COMMENT ON TABLE menu_scrape_attempts IS
  'One row per menu extraction attempt. Written best-effort by scrape-restaurant-menus; a failure to log never fails a scrape.';

-- ----------------------------------------------------------------------------
-- 3. RLS. Diagnostics are admin-only; the service role bypasses RLS and does
--    the writing.
-- ----------------------------------------------------------------------------
ALTER TABLE menu_scrape_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read menu scrape attempts" ON menu_scrape_attempts;
CREATE POLICY "Admins can read menu scrape attempts"
  ON menu_scrape_attempts FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete menu scrape attempts" ON menu_scrape_attempts;
CREATE POLICY "Admins can delete menu scrape attempts"
  ON menu_scrape_attempts FOR DELETE
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. Admin summary: the last attempt per restaurant, with why it failed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION menu_scrape_health(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  restaurant_id UUID,
  restaurant_name TEXT,
  menu_url TEXT,
  has_current_menu BOOLEAN,
  current_item_count INTEGER,
  extraction_method TEXT,
  confidence NUMERIC,
  last_attempt_at TIMESTAMPTZ,
  last_outcome TEXT,
  last_detail TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.menu_url,
    (m.id IS NOT NULL) AS has_current_menu,
    m.item_count AS current_item_count,
    m.extraction_method,
    m.confidence,
    a.created_at AS last_attempt_at,
    a.outcome AS last_outcome,
    a.detail AS last_detail
  FROM restaurants r
  LEFT JOIN restaurant_menus m
    ON m.restaurant_id = r.id AND m.is_current = true
  LEFT JOIN LATERAL (
    SELECT created_at, outcome, detail
    FROM menu_scrape_attempts
    WHERE restaurant_id = r.id
      AND created_at > now() - make_interval(days => days_back)
    ORDER BY created_at DESC
    LIMIT 1
  ) a ON true
  WHERE r.menu_scrape_enabled = true
  ORDER BY (m.id IS NULL) DESC, r.popularity_score DESC NULLS LAST;
$$;

COMMENT ON FUNCTION menu_scrape_health(INTEGER) IS
  'Admin view of menu coverage and the most recent scrape attempt per restaurant. SECURITY INVOKER so RLS on menu_scrape_attempts applies.';
