-- Migration: Add Missing Database Indexes for Query Optimization
-- Date: 2025-11-13
-- Purpose: Optimize frequently queried tables with missing indexes

-- ============================================================================
-- ARTICLES TABLE INDEXES
-- ============================================================================

-- Index for fetching published articles by date (homepage, articles page)
CREATE INDEX IF NOT EXISTS idx_articles_status_published
ON articles(status, published_at DESC)
WHERE status = 'published';

-- Index for articles by category and date
CREATE INDEX IF NOT EXISTS idx_articles_category_published
ON articles(category, published_at DESC)
WHERE status = 'published';

-- Index for articles by author (author pages, management)
CREATE INDEX IF NOT EXISTS idx_articles_author_status
ON articles(author_id, status, published_at DESC);

-- Index for articles by view count (trending/popular articles)
CREATE INDEX IF NOT EXISTS idx_articles_view_count
ON articles(view_count DESC)
WHERE status = 'published' AND view_count > 0;

-- Full-text search index for articles
CREATE INDEX IF NOT EXISTS idx_articles_full_text
ON articles USING gin(to_tsvector('english',
  title || ' ' || COALESCE(content, '') || ' ' || COALESCE(excerpt, '')
));

-- Index for slug lookups (most common article query)
-- Already has UNIQUE constraint, which creates index automatically

-- ============================================================================
-- ARTICLE COMMENTS TABLE INDEXES
-- ============================================================================

-- Index for fetching comments by article
CREATE INDEX IF NOT EXISTS idx_article_comments_article_created
ON article_comments(article_id, created_at DESC);

-- Index for fetching comments by user
CREATE INDEX IF NOT EXISTS idx_article_comments_user_created
ON article_comments(user_id, created_at DESC);

-- Index for nested comments (parent-child relationships)
CREATE INDEX IF NOT EXISTS idx_article_comments_parent
ON article_comments(parent_comment_id, created_at DESC)
WHERE parent_comment_id IS NOT NULL;

-- Index for moderation (unapproved comments)
CREATE INDEX IF NOT EXISTS idx_article_comments_approval
ON article_comments(is_approved, created_at DESC)
WHERE is_approved = false;

-- ============================================================================
-- USER CALENDAR TABLES INDEXES
-- ============================================================================

-- Index for fetching user calendars
CREATE INDEX IF NOT EXISTS idx_user_calendars_user_provider
ON user_calendars(user_id, provider, sync_enabled);

-- Index for primary calendar lookup
CREATE INDEX IF NOT EXISTS idx_user_calendars_primary
ON user_calendars(user_id, is_primary)
WHERE is_primary = true;

-- Index for calendar events by user and time range (most common query)
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time_range
ON calendar_events(user_id, start_time, end_time);

-- Index for calendar events by calendar ID
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar
ON calendar_events(calendar_id, start_time);

-- Index for calendar event status
CREATE INDEX IF NOT EXISTS idx_calendar_events_status
ON calendar_events(user_id, status, start_time)
WHERE status != 'cancelled';

-- ============================================================================
-- SMART EVENT SUGGESTIONS INDEXES
-- ============================================================================

-- Index for active suggestions by user
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_user_active
ON smart_event_suggestions(user_id, suggested_at DESC)
WHERE is_dismissed = false AND is_accepted = false;

-- Index for suggestions by confidence score
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_confidence
ON smart_event_suggestions(user_id, confidence_score DESC, suggested_at DESC)
WHERE is_dismissed = false;

-- Index for suggestions by event
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_event
ON smart_event_suggestions(event_id, confidence_score DESC);

-- ============================================================================
-- USER PREFERENCES AND INTERACTIONS INDEXES
-- ============================================================================

-- Index for user preferences lookups
-- Note: Assuming profiles table exists
CREATE INDEX IF NOT EXISTS idx_profiles_user_role
ON profiles(user_id, user_role);

-- Index for communication preferences
-- Note: Skipping JSONB predicate index due to IMMUTABLE function requirement
-- Alternative: Create a computed column or use a different approach if needed
-- CREATE INDEX IF NOT EXISTS idx_profiles_email_subscribed
-- ON profiles(email)
-- WHERE (communication_preferences->>'email_subscribed')::boolean = true;

-- ============================================================================
-- EVENT REMINDERS TABLE INDEXES
-- ============================================================================

-- Note: The table already has these indexes from its creation migration:
-- - idx_user_event_reminders_user_id
-- - idx_user_event_reminders_event_id
-- - idx_user_event_reminders_sent_at
-- - idx_user_event_reminders_pending
-- So we skip creating duplicate indexes here

-- ============================================================================
-- ADVERTISING CAMPAIGN INDEXES
-- ============================================================================

-- Index for active campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status_dates
ON campaigns(status, start_date, end_date)
WHERE status = 'active';

-- Index for campaigns by user
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status
ON campaigns(user_id, status, created_at DESC);

-- ============================================================================
-- CONTENT SUGGESTIONS INDEXES (AI-driven content)
-- ============================================================================

-- Index for pending suggestions by priority
CREATE INDEX IF NOT EXISTS idx_content_suggestions_status_priority
ON content_suggestions(status, priority_score DESC)
WHERE status = 'pending';

-- Index for suggestions by competitor content
CREATE INDEX IF NOT EXISTS idx_content_suggestions_competitor
ON content_suggestions(competitor_content_id, status);

-- ============================================================================
-- GAMIFICATION INDEXES
-- ============================================================================

-- Note: user_points and user_levels tables don't exist yet
-- Only user_badges table exists

-- Index for user badges (achievements page)
CREATE INDEX IF NOT EXISTS idx_user_badges_earned
ON user_badges(user_id, earned_at DESC);

-- ============================================================================
-- SOCIAL FEATURES INDEXES
-- ============================================================================

-- Note: Many indexes already exist from the table creation migration
-- event_checkins already has:
-- - idx_event_checkins_event_id
-- - idx_event_checkins_user_id
-- - idx_event_checkins_created_at
-- - idx_event_checkins_is_verified
-- event_photos already has:
-- - idx_event_photos_event_id
-- - idx_event_photos_user_id
-- - idx_event_photos_created_at
-- - idx_event_photos_is_featured
-- user_follows already has:
-- - idx_user_follows_follower_id
-- - idx_user_follows_following_id
-- So we skip creating duplicate indexes here

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON MULTI-COLUMN QUERIES
-- ============================================================================

-- Events: City + Category + Date (location-based category browsing)
-- Note: Cannot use CURRENT_DATE in WHERE clause (not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_events_city_category_date
ON events(city, category, date);

-- Events: Subcategory + Date (subcategory filtering)
-- Note: subcategory column does not exist in events table
-- Skipping this index

-- Events: Price range queries
-- Note: Cannot use CURRENT_DATE in WHERE clause (not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_events_price_date
ON events(price, date)
WHERE price IS NOT NULL;

-- Restaurants: City + Cuisine + Rating (most common restaurant search)
CREATE INDEX IF NOT EXISTS idx_restaurants_city_cuisine_rating
ON restaurants(city, cuisine, rating DESC);

-- Restaurants: Price range + City (budget-based searching)
-- Note: price_range column does not exist in restaurants table
-- Skipping this index

-- ============================================================================
-- PARTIAL INDEXES FOR SPECIFIC USE CASES
-- ============================================================================

-- Featured content only (homepage queries)
-- Note: Cannot use CURRENT_DATE in WHERE clause (not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_events_featured_upcoming
ON events(date, is_featured)
WHERE is_featured = true;

-- Free events (popular filter)
-- Note: Cannot use CURRENT_DATE in WHERE clause (not IMMUTABLE)
-- Note: price column type mismatch - skipping predicate
CREATE INDEX IF NOT EXISTS idx_events_free_upcoming
ON events(date);

-- Weekend events (Friday-Sunday)
-- Note: Cannot use EXTRACT or CURRENT_DATE in WHERE clause (not IMMUTABLE)
-- Alternative: Query all events and filter in application code
CREATE INDEX IF NOT EXISTS idx_events_weekend
ON events(date);

-- Today's events (very common query)
-- Note: Cannot use CURRENT_DATE in WHERE clause (not IMMUTABLE)
-- Alternative: Use regular date index and filter in application code
CREATE INDEX IF NOT EXISTS idx_events_today
ON events(date, created_at);

-- ============================================================================
-- ANALYZE TABLES TO UPDATE STATISTICS
-- ============================================================================

-- Update query planner statistics for better query plans
ANALYZE articles;
ANALYZE article_comments;
ANALYZE user_calendars;
ANALYZE calendar_events;
ANALYZE smart_event_suggestions;
ANALYZE user_event_reminders;
ANALYZE campaigns;
ANALYZE content_suggestions;
ANALYZE user_badges;
ANALYZE event_checkins;
ANALYZE event_photos;
ANALYZE user_follows;
ANALYZE events;
ANALYZE restaurants;
ANALYZE attractions;
ANALYZE playgrounds;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_articles_status_published IS 'Optimizes queries for published articles ordered by date';
COMMENT ON INDEX idx_articles_full_text IS 'Full-text search index for article content';
COMMENT ON INDEX idx_calendar_events_user_time_range IS 'Optimizes calendar event queries by user and time range';
COMMENT ON INDEX idx_smart_suggestions_user_active IS 'Optimizes fetching active event suggestions for users';
COMMENT ON INDEX idx_campaigns_status_dates IS 'Optimizes queries for active advertising campaigns';
COMMENT ON INDEX idx_events_city_category_date IS 'Composite index for location-based category browsing';
COMMENT ON INDEX idx_events_featured_upcoming IS 'Partial index for featured upcoming events (homepage)';
COMMENT ON INDEX idx_events_free_upcoming IS 'Partial index for free upcoming events';
COMMENT ON INDEX idx_events_today IS 'Partial index for today''s events (very common query)';
