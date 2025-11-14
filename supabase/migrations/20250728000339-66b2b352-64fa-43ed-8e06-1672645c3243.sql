-- Create analytics tables for tracking user interactions and generating real trending data

-- User interaction tracking for events, restaurants, attractions, playgrounds
CREATE TABLE public.user_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL, -- 'view', 'search', 'click', 'share', 'bookmark'
  content_type TEXT NOT NULL, -- 'event', 'restaurant', 'attraction', 'playground'
  content_id UUID NOT NULL,
  search_query TEXT,
  filters_used JSONB,
  device_type TEXT,
  user_agent TEXT,
  ip_address INET,
  referrer TEXT,
  page_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Search queries tracking for trending searches
CREATE TABLE public.search_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  category TEXT,
  location TEXT,
  date_filter JSONB,
  price_filter TEXT,
  results_count INTEGER,
  clicked_result_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Content performance tracking
CREATE TABLE public.content_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  metric_type TEXT NOT NULL, -- 'view', 'click', 'search_impression', 'time_spent'
  metric_value INTEGER DEFAULT 1,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hour INTEGER DEFAULT EXTRACT(hour FROM now()),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(content_type, content_id, metric_type, date, hour)
);

-- Trending scores (computed daily)
CREATE TABLE public.trending_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  rank INTEGER,
  views_24h INTEGER DEFAULT 0,
  views_7d INTEGER DEFAULT 0,
  searches_24h INTEGER DEFAULT 0,
  searches_7d INTEGER DEFAULT 0,
  velocity_score DECIMAL(10,2) DEFAULT 0, -- How fast it's growing
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(content_type, content_id, date)
);

-- Enable RLS
ALTER TABLE public.user_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_scores ENABLE ROW LEVEL SECURITY;

-- Policies for analytics (service role and authenticated users can insert, public can read aggregated data)
CREATE POLICY "Service role can manage analytics" ON public.user_analytics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can insert their own analytics" ON public.user_analytics FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Service role can manage search analytics" ON public.search_analytics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can insert their own search analytics" ON public.search_analytics FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Service role can manage content metrics" ON public.content_metrics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can read content metrics" ON public.content_metrics FOR SELECT USING (true);

CREATE POLICY "Anyone can read trending scores" ON public.trending_scores FOR SELECT USING (true);
CREATE POLICY "Service role can manage trending scores" ON public.trending_scores FOR ALL USING (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_user_analytics_content ON public.user_analytics(content_type, content_id, created_at);
CREATE INDEX idx_user_analytics_session ON public.user_analytics(session_id, created_at);
CREATE INDEX idx_search_analytics_query ON public.search_analytics(query, created_at);
CREATE INDEX idx_content_metrics_content ON public.content_metrics(content_type, content_id, date);
CREATE INDEX idx_trending_scores_rank ON public.trending_scores(content_type, rank, date);

-- Function to calculate trending scores (runs daily)
CREATE OR REPLACE FUNCTION calculate_trending_scores()
RETURNS void AS $$
DECLARE
    content_rec RECORD;
    views_24h INTEGER;
    views_7d INTEGER;
    searches_24h INTEGER;
    searches_7d INTEGER;
    velocity DECIMAL(10,2);
    final_score DECIMAL(10,2);
    rank_counter INTEGER;
BEGIN
    -- Clear today's trending scores
    DELETE FROM public.trending_scores WHERE date = CURRENT_DATE;
    
    -- Calculate for each content type
    FOR content_rec IN 
        SELECT DISTINCT content_type, content_id 
        FROM public.content_metrics 
         - INTERVAL '7 days'
    LOOP
        -- Get metrics
        SELECT COALESCE(SUM(metric_value), 0) INTO views_24h
        FROM public.content_metrics 
        WHERE content_type = content_rec.content_type 
          AND content_id = content_rec.content_id 
          AND metric_type = 'view'
           - INTERVAL '1 day';
          
        SELECT COALESCE(SUM(metric_value), 0) INTO views_7d
        FROM public.content_metrics 
        WHERE content_type = content_rec.content_type 
          AND content_id = content_rec.content_id 
          AND metric_type = 'view'
           - INTERVAL '7 days';
          
        SELECT COUNT(*) INTO searches_24h
        FROM public.search_analytics sa
        JOIN public.user_analytics ua ON ua.session_id = sa.session_id
        WHERE ua.content_type = content_rec.content_type 
          AND ua.content_id = content_rec.content_id
          AND ua.event_type = 'click'
          AND sa.created_at >= CURRENT_DATE - INTERVAL '1 day';
          
        SELECT COUNT(*) INTO searches_7d
        FROM public.search_analytics sa
        JOIN public.user_analytics ua ON ua.session_id = sa.session_id
        WHERE ua.content_type = content_rec.content_type 
          AND ua.content_id = content_rec.content_id
          AND ua.event_type = 'click'
          AND sa.created_at >= CURRENT_DATE - INTERVAL '7 days';
        
        -- Calculate velocity (growth rate)
        velocity := CASE 
            WHEN views_7d > 0 THEN (views_24h::DECIMAL / (views_7d::DECIMAL / 7.0)) * 10
            ELSE 0 
        END;
        
        -- Calculate final score (weighted)
        final_score := (views_24h * 3) + (views_7d * 1) + (searches_24h * 5) + (searches_7d * 2) + (velocity * 2);
        
        -- Insert trending score
        INSERT INTO public.trending_scores (
            content_type, content_id, score, views_24h, views_7d, 
            searches_24h, searches_7d, velocity_score
        ) VALUES (
            content_rec.content_type, content_rec.content_id, final_score, 
            views_24h, views_7d, searches_24h, searches_7d, velocity
        );
    END LOOP;
    
    -- Assign ranks within each content type
    rank_counter := 1;
    FOR content_rec IN 
        SELECT content_type, id
        FROM public.trending_scores 
        WHERE date = CURRENT_DATE
        ORDER BY content_type, score DESC
    LOOP
        UPDATE public.trending_scores 
        SET rank = rank_counter 
        WHERE id = content_rec.id;
        
        rank_counter := rank_counter + 1;
    END LOOP;
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;