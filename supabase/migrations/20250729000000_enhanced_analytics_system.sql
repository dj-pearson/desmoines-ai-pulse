-- Enhanced Analytics Tables for Advanced Behavior Tracking and Personalization
-- This migration adds comprehensive tracking capabilities for user behavior, preferences, and real-time trending

-- Enhanced user interactions table with detailed behavioral data
CREATE TABLE IF NOT EXISTS public.user_interactions_enhanced (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  
  -- Interaction details
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'hover', 'scroll', 'search', 'filter', 'share', 'bookmark', 'conversion')),
  element_type TEXT CHECK (element_type IN ('card', 'button', 'link', 'search_input', 'filter_dropdown', 'navigation', 'image', 'video')),
  element_id TEXT,
  
  -- Content context
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction', 'playground', 'page', 'search_result')),
  content_id UUID,
  page_context TEXT NOT NULL, -- Current page/route
  
  -- Interaction metrics
  duration_ms INTEGER CHECK (duration_ms >= 0),
  scroll_depth INTEGER CHECK (scroll_depth >= 0 AND scroll_depth <= 100), -- Percentage scrolled
  click_position TEXT CHECK (click_position IN ('above_fold', 'below_fold')),
  interaction_value TEXT, -- Search query, filter value, etc.
  
  -- User context
  device_type TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop')),
  viewport_size TEXT,
  user_agent TEXT,
  referrer TEXT,
  
  -- Geolocation (if available)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User preference profiles for personalization
CREATE TABLE IF NOT EXISTS public.user_preference_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id UUID, -- For anonymous users
  
  -- Preference categories (stored as JSONB for flexibility)
  preferred_cuisines JSONB DEFAULT '[]'::jsonb,
  preferred_event_types JSONB DEFAULT '[]'::jsonb,
  preferred_price_ranges JSONB DEFAULT '[]'::jsonb,
  preferred_locations JSONB DEFAULT '[]'::jsonb,
  preferred_times JSONB DEFAULT '[]'::jsonb, -- 'morning', 'afternoon', 'evening', 'weekend'
  
  -- Behavioral patterns
  avg_session_duration INTEGER DEFAULT 0,
  primary_device TEXT,
  search_patterns JSONB DEFAULT '{}'::jsonb,
  interaction_patterns JSONB DEFAULT '{}'::jsonb,
  content_preferences JSONB DEFAULT '{}'::jsonb,
  
  -- Confidence scores for each preference category
  preference_confidence JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  total_sessions INTEGER DEFAULT 0,
  total_interactions INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure either user_id or session_id is present
  CONSTRAINT check_user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Real-time trending scores with multiple time windows
CREATE TABLE IF NOT EXISTS public.trending_scores_realtime (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction', 'playground')),
  content_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Time window scores
  score_1h DECIMAL(10, 4) DEFAULT 0,
  score_6h DECIMAL(10, 4) DEFAULT 0,
  score_24h DECIMAL(10, 4) DEFAULT 0,
  score_7d DECIMAL(10, 4) DEFAULT 0,
  score_30d DECIMAL(10, 4) DEFAULT 0,
  
  -- Interaction metrics
  unique_views_1h INTEGER DEFAULT 0,
  unique_views_6h INTEGER DEFAULT 0,
  unique_views_24h INTEGER DEFAULT 0,
  unique_views_7d INTEGER DEFAULT 0,
  total_interactions_1h INTEGER DEFAULT 0,
  total_interactions_24h INTEGER DEFAULT 0,
  
  -- Engagement metrics
  avg_engagement_time DECIMAL(10, 2) DEFAULT 0, -- Average time spent
  engagement_score DECIMAL(10, 4) DEFAULT 0, -- Weighted engagement
  conversion_rate DECIMAL(5, 4) DEFAULT 0, -- Clicks to website/phone
  share_count INTEGER DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,
  
  -- Trend indicators
  velocity_score DECIMAL(10, 4) DEFAULT 0, -- Rate of growth
  momentum_score DECIMAL(10, 4) DEFAULT 0, -- Sustained interest
  peak_hour INTEGER, -- Hour of day with peak activity
  
  -- Geographic trending
  trending_locations JSONB DEFAULT '[]'::jsonb,
  
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint for content per date
  UNIQUE(content_type, content_id, date)
);

-- Content performance metrics for A/B testing and optimization
CREATE TABLE IF NOT EXISTS public.content_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction', 'playground')),
  content_id UUID NOT NULL,
  
  -- Performance metrics
  total_views INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  avg_view_duration DECIMAL(10, 2) DEFAULT 0,
  bounce_rate DECIMAL(5, 4) DEFAULT 0, -- Percentage who leave immediately
  click_through_rate DECIMAL(5, 4) DEFAULT 0, -- CTR to external links
  conversion_rate DECIMAL(5, 4) DEFAULT 0,
  
  -- Search performance
  search_result_clicks INTEGER DEFAULT 0,
  search_result_position DECIMAL(5, 2), -- Average position in search results
  
  -- Social signals
  shares_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  
  -- Quality metrics
  user_rating DECIMAL(3, 2), -- Average user rating if available
  content_freshness_score DECIMAL(5, 2), -- How up-to-date the content is
  
  -- Time-based metrics
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(content_type, content_id, date)
);

-- User journey tracking for conversion optimization
CREATE TABLE IF NOT EXISTS public.user_journeys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  
  -- Journey details
  entry_point TEXT NOT NULL, -- How user arrived (search, direct, referral)
  entry_page TEXT NOT NULL,
  exit_page TEXT,
  total_pages_viewed INTEGER DEFAULT 1,
  session_duration INTEGER, -- Total session time in seconds
  
  -- Conversion tracking
  converted BOOLEAN DEFAULT false,
  conversion_type TEXT, -- 'website_visit', 'phone_call', 'direction_request', 'email'
  conversion_content_type TEXT,
  conversion_content_id UUID,
  
  -- Journey path (array of pages visited)
  page_sequence JSONB DEFAULT '[]'::jsonb,
  interaction_sequence JSONB DEFAULT '[]'::jsonb,
  
  -- Search behavior in session
  searches_count INTEGER DEFAULT 0,
  filters_used JSONB DEFAULT '[]'::jsonb,
  search_terms JSONB DEFAULT '[]'::jsonb,
  
  -- Device and context
  device_type TEXT,
  user_agent TEXT,
  referrer TEXT,
  
  session_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  session_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Personalized recommendation cache for performance
CREATE TABLE IF NOT EXISTS public.personalized_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id UUID, -- For anonymous users
  
  -- Recommendation details
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction', 'playground')),
  content_id UUID NOT NULL,
  recommendation_score DECIMAL(10, 4) NOT NULL,
  recommendation_reason TEXT, -- Why this was recommended
  
  -- Context when recommendation was generated
  context_factors JSONB DEFAULT '{}'::jsonb, -- Time, location, user state, etc.
  algorithm_version TEXT DEFAULT 'v1',
  
  -- Performance tracking
  shown_to_user BOOLEAN DEFAULT false,
  clicked_by_user BOOLEAN DEFAULT false,
  user_feedback INTEGER CHECK (user_feedback IN (-1, 0, 1)), -- Dislike, neutral, like
  
  -- Metadata
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT check_user_or_session_rec CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_interactions_enhanced_session ON public.user_interactions_enhanced(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_user_interactions_enhanced_content ON public.user_interactions_enhanced(content_type, content_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_user_interactions_enhanced_user ON public.user_interactions_enhanced(user_id, timestamp) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_interactions_enhanced_type ON public.user_interactions_enhanced(interaction_type, timestamp);

CREATE INDEX IF NOT EXISTS idx_user_preference_profiles_user ON public.user_preference_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_preference_profiles_session ON public.user_preference_profiles(session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trending_scores_realtime_content ON public.trending_scores_realtime(content_type, content_id, date);
CREATE INDEX IF NOT EXISTS idx_trending_scores_realtime_score ON public.trending_scores_realtime(score_24h DESC, date);
CREATE INDEX IF NOT EXISTS idx_trending_scores_realtime_velocity ON public.trending_scores_realtime(velocity_score DESC, date);

CREATE INDEX IF NOT EXISTS idx_content_performance_date ON public.content_performance_metrics(date, content_type);
CREATE INDEX IF NOT EXISTS idx_content_performance_content ON public.content_performance_metrics(content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_user_journeys_session ON public.user_journeys(session_id, session_start);
CREATE INDEX IF NOT EXISTS idx_user_journeys_user ON public.user_journeys(user_id, session_start) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_journeys_conversion ON public.user_journeys(converted, conversion_type) WHERE converted = true;

CREATE INDEX IF NOT EXISTS idx_personalized_recommendations_user ON public.personalized_recommendations(user_id, expires_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalized_recommendations_session ON public.personalized_recommendations(session_id, expires_at) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalized_recommendations_score ON public.personalized_recommendations(recommendation_score DESC, generated_at);

-- Set up Row Level Security (RLS)
ALTER TABLE public.user_interactions_enhanced ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preference_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_scores_realtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalized_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role can manage enhanced analytics" ON public.user_interactions_enhanced FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can insert their own enhanced analytics" ON public.user_interactions_enhanced FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Service role can manage preference profiles" ON public.user_preference_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can manage their own preferences" ON public.user_preference_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anonymous users can manage session preferences" ON public.user_preference_profiles FOR ALL USING (auth.uid() IS NULL AND user_id IS NULL);

CREATE POLICY "Everyone can read trending scores" ON public.trending_scores_realtime FOR SELECT USING (true);
CREATE POLICY "Service role can manage trending scores" ON public.trending_scores_realtime FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Everyone can read content performance" ON public.content_performance_metrics FOR SELECT USING (true);
CREATE POLICY "Service role can manage content performance" ON public.content_performance_metrics FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage user journeys" ON public.user_journeys FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can view their own journeys" ON public.user_journeys FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage recommendations" ON public.personalized_recommendations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can view their own recommendations" ON public.personalized_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anonymous users can view session recommendations" ON public.personalized_recommendations FOR SELECT USING (auth.uid() IS NULL AND user_id IS NULL);

-- Create functions for automatic trending score calculation
CREATE OR REPLACE FUNCTION update_trending_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update trending scores based on recent interactions
  INSERT INTO public.trending_scores_realtime (content_type, content_id, date)
  SELECT DISTINCT content_type, content_id, CURRENT_DATE
  FROM public.user_interactions_enhanced
  WHERE timestamp >= CURRENT_DATE
  ON CONFLICT (content_type, content_id, date) DO NOTHING;
  
  -- Calculate 1h scores
  UPDATE public.trending_scores_realtime 
  SET 
    unique_views_1h = subquery.unique_views,
    total_interactions_1h = subquery.total_interactions,
    score_1h = subquery.score
  FROM (
    SELECT 
      content_type,
      content_id,
      COUNT(DISTINCT session_id) as unique_views,
      COUNT(*) as total_interactions,
      COUNT(DISTINCT session_id) * 1.0 + COUNT(*) * 0.5 as score
    FROM public.user_interactions_enhanced
    WHERE timestamp >= NOW() - INTERVAL '1 hour'
    GROUP BY content_type, content_id
  ) subquery
  WHERE trending_scores_realtime.content_type = subquery.content_type
    AND trending_scores_realtime.content_id = subquery.content_id
    AND trending_scores_realtime.date = CURRENT_DATE;
    
  -- Calculate 24h scores (similar pattern for other time windows)
  UPDATE public.trending_scores_realtime 
  SET 
    unique_views_24h = subquery.unique_views,
    total_interactions_24h = subquery.total_interactions,
    score_24h = subquery.score,
    avg_engagement_time = subquery.avg_duration
  FROM (
    SELECT 
      content_type,
      content_id,
      COUNT(DISTINCT session_id) as unique_views,
      COUNT(*) as total_interactions,
      COUNT(DISTINCT session_id) * 2.0 + COUNT(*) * 1.0 as score,
      AVG(duration_ms) / 1000.0 as avg_duration
    FROM public.user_interactions_enhanced
    WHERE timestamp >= NOW() - INTERVAL '24 hours'
    GROUP BY content_type, content_id
  ) subquery
  WHERE trending_scores_realtime.content_type = subquery.content_type
    AND trending_scores_realtime.content_id = subquery.content_id
    AND trending_scores_realtime.date = CURRENT_DATE;
    
  -- Calculate velocity (rate of change)
  UPDATE public.trending_scores_realtime 
  SET velocity_score = GREATEST(0, score_24h - score_7d)
  WHERE date = CURRENT_DATE;
END;
$$;

-- Schedule trending score updates (requires pg_cron extension)
-- This would be run periodically by a cron job or edge function
-- SELECT cron.schedule('update-trending-scores', '*/15 * * * *', 'SELECT update_trending_scores();');

-- Sample data views for analytics dashboard
CREATE OR REPLACE VIEW public.analytics_dashboard_summary AS
SELECT 
  -- Today's stats
  (SELECT COUNT(*) FROM public.user_interactions_enhanced WHERE timestamp >= CURRENT_DATE) as interactions_today,
  (SELECT COUNT(DISTINCT session_id) FROM public.user_interactions_enhanced WHERE timestamp >= CURRENT_DATE) as sessions_today,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_interactions_enhanced WHERE timestamp >= CURRENT_DATE AND user_id IS NOT NULL) as unique_users_today,
  
  -- Popular content today
  (SELECT jsonb_agg(trending_item ORDER BY score DESC)
   FROM (
     SELECT jsonb_build_object('content_type', content_type, 'content_id', content_id, 'score', score_24h) as trending_item,
            score_24h as score
     FROM public.trending_scores_realtime 
     WHERE date = CURRENT_DATE 
     ORDER BY score_24h DESC 
     LIMIT 10
   ) trending_subquery) as trending_content,
   
  -- Device breakdown
  (SELECT jsonb_object_agg(device_type, count)
   FROM (
     SELECT device_type, COUNT(*) as count
     FROM public.user_interactions_enhanced 
     WHERE timestamp >= CURRENT_DATE
     GROUP BY device_type
   ) device_stats) as device_breakdown;

COMMENT ON TABLE public.user_interactions_enhanced IS 'Detailed user interaction tracking for behavior analysis and personalization';
COMMENT ON TABLE public.user_preference_profiles IS 'User preference profiles derived from behavior and explicit choices';
COMMENT ON TABLE public.trending_scores_realtime IS 'Real-time trending scores across multiple time windows';
COMMENT ON TABLE public.content_performance_metrics IS 'Content performance metrics for optimization';
COMMENT ON TABLE public.user_journeys IS 'Complete user journey tracking for conversion analysis';
COMMENT ON TABLE public.personalized_recommendations IS 'Cached personalized recommendations for users';
