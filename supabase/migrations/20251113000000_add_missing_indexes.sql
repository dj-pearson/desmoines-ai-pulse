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
CREATE INDEX IF NOT EXISTS idx_profiles_email_subscribed
ON profiles(email)
WHERE (communication_preferences->>'email_subscribed')::boolean = true;

-- ============================================================================
-- EVENT REMINDERS TABLE INDEXES
-- ============================================================================

-- Index for pending reminders (scheduled job query)
CREATE INDEX IF NOT EXISTS idx_event_reminders_pending
ON event_reminders(scheduled_for, sent)
WHERE sent = false;

-- Index for user reminders
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_event
ON event_reminders(user_id, event_id, sent);

-- ============================================================================
-- ADVERTISING CAMPAIGN INDEXES
-- ============================================================================

-- Index for active campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status_dates
ON campaigns(status, start_date, end_date)
WHERE status = 'active';

-- Index for campaigns by advertiser
CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser_status
ON campaigns(advertiser_id, status, created_at DESC);

-- Index for campaign analytics queries
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_date_range
ON campaign_analytics(campaign_id, date DESC);

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
-- SEARCH TRAFFIC ANALYTICS INDEXES
-- ============================================================================

-- Index for search analytics by keyword and date
CREATE INDEX IF NOT EXISTS idx_search_keywords_date
ON search_keywords(keyword, date DESC);

-- Index for top keywords by impressions
CREATE INDEX IF NOT EXISTS idx_search_keywords_impressions
ON search_keywords(date, impressions DESC);

-- Index for keywords by CTR (performance analysis)
CREATE INDEX IF NOT EXISTS idx_search_keywords_ctr
ON search_keywords(date, ctr DESC)
WHERE impressions > 100;

-- ============================================================================
-- GAMIFICATION INDEXES
-- ============================================================================

-- Index for user points leaderboard
CREATE INDEX IF NOT EXISTS idx_user_points_total
ON user_points(total_points DESC, updated_at DESC);

-- Index for user level rankings
CREATE INDEX IF NOT EXISTS idx_user_levels_level
ON user_levels(level DESC, xp DESC);

-- Index for user badges (achievements page)
CREATE INDEX IF NOT EXISTS idx_user_badges_earned
ON user_badges(user_id, earned_at DESC);

-- ============================================================================
-- SOCIAL FEATURES INDEXES
-- ============================================================================

-- Index for event check-ins by event
CREATE INDEX IF NOT EXISTS idx_event_checkins_event_time
ON event_checkins(event_id, checked_in_at DESC);

-- Index for event check-ins by user
CREATE INDEX IF NOT EXISTS idx_event_checkins_user_time
ON event_checkins(user_id, checked_in_at DESC);

-- Index for event photos
CREATE INDEX IF NOT EXISTS idx_event_photos_event
ON event_photos(event_id, uploaded_at DESC);

-- Index for user following relationships
CREATE INDEX IF NOT EXISTS idx_user_follows_follower
ON user_follows(follower_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_follows_following
ON user_follows(following_id, created_at DESC);

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON MULTI-COLUMN QUERIES
-- ============================================================================

-- Events: City + Category + Date (location-based category browsing)
CREATE INDEX IF NOT EXISTS idx_events_city_category_date
ON events(city, category, date)
WHERE date >= CURRENT_DATE;

-- Events: Subcategory + Date (subcategory filtering)
CREATE INDEX IF NOT EXISTS idx_events_subcategory_date
ON events(subcategory, date)
WHERE subcategory IS NOT NULL AND date >= CURRENT_DATE;

-- Events: Price range queries
CREATE INDEX IF NOT EXISTS idx_events_price_date
ON events(price, date)
WHERE price IS NOT NULL AND date >= CURRENT_DATE;

-- Restaurants: City + Cuisine + Rating (most common restaurant search)
CREATE INDEX IF NOT EXISTS idx_restaurants_city_cuisine_rating
ON restaurants(city, cuisine, rating DESC);

-- Restaurants: Price range + City (budget-based searching)
CREATE INDEX IF NOT EXISTS idx_restaurants_price_city
ON restaurants(price_range, city, rating DESC);

-- ============================================================================
-- PARTIAL INDEXES FOR SPECIFIC USE CASES
-- ============================================================================

-- Featured content only (homepage queries)
CREATE INDEX IF NOT EXISTS idx_events_featured_upcoming
ON events(date, is_featured)
WHERE is_featured = true AND date >= CURRENT_DATE;

-- Free events (popular filter)
CREATE INDEX IF NOT EXISTS idx_events_free_upcoming
ON events(date)
WHERE (price = 0 OR price IS NULL) AND date >= CURRENT_DATE;

-- Weekend events (Friday-Sunday)
CREATE INDEX IF NOT EXISTS idx_events_weekend
ON events(date)
WHERE EXTRACT(DOW FROM date) IN (5, 6, 0) AND date >= CURRENT_DATE;

-- Today's events (very common query)
CREATE INDEX IF NOT EXISTS idx_events_today
ON events(date, created_at)
WHERE date = CURRENT_DATE;

-- ============================================================================
-- ANALYZE TABLES TO UPDATE STATISTICS
-- ============================================================================

-- Update query planner statistics for better query plans
ANALYZE articles;
ANALYZE article_comments;
ANALYZE user_calendars;
ANALYZE calendar_events;
ANALYZE smart_event_suggestions;
ANALYZE event_reminders;
ANALYZE campaigns;
ANALYZE campaign_analytics;
ANALYZE content_suggestions;
ANALYZE search_keywords;
ANALYZE user_points;
ANALYZE user_levels;
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
COMMENT ON INDEX idx_event_reminders_pending IS 'Optimizes scheduled job for sending pending reminders';
COMMENT ON INDEX idx_campaigns_status_dates IS 'Optimizes queries for active advertising campaigns';
COMMENT ON INDEX idx_events_city_category_date IS 'Composite index for location-based category browsing';
COMMENT ON INDEX idx_events_featured_upcoming IS 'Partial index for featured upcoming events (homepage)';
COMMENT ON INDEX idx_events_free_upcoming IS 'Partial index for free upcoming events';
COMMENT ON INDEX idx_events_today IS 'Partial index for today\'s events (very common query)';
