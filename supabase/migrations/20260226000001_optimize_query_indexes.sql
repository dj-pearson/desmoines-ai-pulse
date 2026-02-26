-- Database query optimization indexes (US-025)
-- Adds composite indexes for common query patterns and foreign key columns
-- used in joins to improve page load and filter performance.

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

-- ============================================================
-- Foreign key indexes for join performance
-- ============================================================

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

-- ============================================================
-- Partial index for upcoming events (most common query pattern)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_events_upcoming
  ON events (date ASC)
  WHERE date >= now();

-- ============================================================
-- Full-text search indexes on title/name columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_events_title_trgm
  ON events USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm
  ON restaurants USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_attractions_name_trgm
  ON attractions USING gin (name gin_trgm_ops);

-- ============================================================
-- Content metrics indexes for analytics dashboard queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_content_metrics_content_id_type
  ON content_metrics (content_id, metric_type);

CREATE INDEX IF NOT EXISTS idx_content_metrics_created_at
  ON content_metrics (created_at DESC);

-- ============================================================
-- User analytics indexes for session/funnel queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_analytics_session_id
  ON user_analytics (session_id);

CREATE INDEX IF NOT EXISTS idx_user_analytics_event_type
  ON user_analytics (event_type);
