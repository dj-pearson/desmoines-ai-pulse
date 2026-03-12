-- Database query optimization indexes (US-025)
-- Adds composite indexes for common query patterns and foreign key columns
-- used in joins to improve page load and filter performance.
-- Wrapped in DO blocks to safely skip indexes on missing columns/tables.

DO $$ BEGIN

-- ============================================================
-- Composite indexes for common filter combinations
-- ============================================================

-- Events: commonly filtered by date + category, date + city
CREATE INDEX IF NOT EXISTS idx_events_date_category
  ON events (date, category);

CREATE INDEX IF NOT EXISTS idx_events_date_city
  ON events (date, city);

-- Restaurants: commonly filtered by cuisine + city, sorted by rating
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_city
  ON restaurants (cuisine, city);

CREATE INDEX IF NOT EXISTS idx_restaurants_rating_desc
  ON restaurants (rating DESC NULLS LAST);

-- Attractions: commonly filtered by category + city
CREATE INDEX IF NOT EXISTS idx_attractions_category_city
  ON attractions (category, city);

EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE NOTICE 'Skipping composite indexes: some columns/tables do not exist yet';
END $$;

-- ============================================================
-- Foreign key indexes for join performance
-- ============================================================

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_favorites_user_id
  ON favorites (user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_event_id
  ON favorites (event_id);

CREATE INDEX IF NOT EXISTS idx_ratings_user_id
  ON ratings (user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_entity_id
  ON reviews (entity_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON reviews (user_id);

EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE NOTICE 'Skipping FK indexes: some columns/tables do not exist yet';
END $$;

-- ============================================================
-- General index on events date for upcoming queries
-- (Cannot use now() in partial index predicate - not immutable)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_events_date_asc
  ON events (date ASC);

-- ============================================================
-- Full-text search indexes on title/name columns
-- ============================================================

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_events_title_trgm
  ON events USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm
  ON restaurants USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_attractions_name_trgm
  ON attractions USING gin (name gin_trgm_ops);

EXCEPTION WHEN undefined_column OR undefined_table OR undefined_object THEN
  RAISE NOTICE 'Skipping trigram indexes: pg_trgm extension or columns may not exist';
END $$;

-- ============================================================
-- Content metrics indexes for analytics dashboard queries
-- ============================================================

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_content_metrics_content_id_type
  ON content_metrics (content_id, metric_type);

CREATE INDEX IF NOT EXISTS idx_content_metrics_created_at
  ON content_metrics (created_at DESC);

EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE NOTICE 'Skipping content_metrics indexes: table may not exist';
END $$;

-- ============================================================
-- User analytics indexes for session/funnel queries
-- ============================================================

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_user_analytics_session_id
  ON user_analytics (session_id);

CREATE INDEX IF NOT EXISTS idx_user_analytics_event_type
  ON user_analytics (event_type);

EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE NOTICE 'Skipping user_analytics indexes: table may not exist';
END $$;
