-- Performance optimization indexes for Des Moines Insider (Simplified without WHERE clauses)

-- Events table indexes
CREATE INDEX IF NOT EXISTS idx_events_date_featured ON events(date, is_featured);
CREATE INDEX IF NOT EXISTS idx_events_category_date ON events(category, date);
CREATE INDEX IF NOT EXISTS idx_events_location_date ON events(location, date);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- Restaurants table indexes
CREATE INDEX IF NOT EXISTS idx_restaurants_featured_rating ON restaurants(is_featured, rating DESC);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_rating ON restaurants(cuisine, rating DESC);
CREATE INDEX IF NOT EXISTS idx_restaurants_location_rating ON restaurants(location, rating DESC);
CREATE INDEX IF NOT EXISTS idx_restaurants_status_opening ON restaurants(status, opening_date);

-- Attractions table indexes (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attractions') THEN
    CREATE INDEX IF NOT EXISTS idx_attractions_featured_rating ON attractions(is_featured, rating DESC);
    CREATE INDEX IF NOT EXISTS idx_attractions_type_rating ON attractions(type, rating DESC);
    CREATE INDEX IF NOT EXISTS idx_attractions_location_rating ON attractions(location, rating DESC);
  END IF;
END $$;

-- Playgrounds table indexes (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playgrounds') THEN
    CREATE INDEX IF NOT EXISTS idx_playgrounds_featured_rating ON playgrounds(is_featured, rating DESC);
    CREATE INDEX IF NOT EXISTS idx_playgrounds_age_rating ON playgrounds(age_range, rating DESC);
    CREATE INDEX IF NOT EXISTS idx_playgrounds_location_rating ON playgrounds(location, rating DESC);
  END IF;
END $$;

-- Security audit logs indexes
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_timestamp ON security_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type ON security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id ON security_audit_logs(user_id);

-- CSP violation logs indexes
CREATE INDEX IF NOT EXISTS idx_csp_violation_logs_timestamp ON csp_violation_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violation_logs_directive ON csp_violation_logs(violated_directive);

-- Content metrics optimization (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_metrics') THEN
    CREATE INDEX IF NOT EXISTS idx_content_metrics_date_type ON content_metrics(date DESC, content_type);
    CREATE INDEX IF NOT EXISTS idx_content_metrics_content_id ON content_metrics(content_id, metric_type);
  END IF;
END $$;

-- Search analytics optimization (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'search_analytics') THEN
    CREATE INDEX IF NOT EXISTS idx_search_analytics_date ON search_analytics(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query);
  END IF;
END $$;

-- Add query optimization hints
COMMENT ON TABLE events IS 'Events table optimized for date-based queries and full-text search';
COMMENT ON TABLE restaurants IS 'Restaurants table optimized for featured content and location-based queries';

-- Add comments for optional tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attractions') THEN
    EXECUTE 'COMMENT ON TABLE attractions IS ''Attractions table optimized for type and rating queries''';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playgrounds') THEN
    EXECUTE 'COMMENT ON TABLE playgrounds IS ''Playgrounds table optimized for age-range and location queries''';
  END IF;
END $$;