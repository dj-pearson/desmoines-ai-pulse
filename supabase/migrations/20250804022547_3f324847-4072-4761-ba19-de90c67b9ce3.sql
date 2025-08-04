-- Smart Calendar Integration System
-- User calendar connections and preferences
CREATE TABLE public.user_calendars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple', 'manual')),
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  access_token_encrypted TEXT, -- For OAuth tokens (encrypted)
  refresh_token_encrypted TEXT,
  is_primary BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, calendar_id)
);

-- User calendar events (synced from external calendars)
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES public.user_calendars(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_all_day BOOLEAN DEFAULT false,
  location TEXT,
  attendees JSONB DEFAULT '[]',
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, external_event_id)
);

-- Event recommendations based on calendar availability
CREATE TABLE public.smart_event_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  suggested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT NOT NULL, -- 'free_time', 'similar_interests', 'location_convenient', etc.
  confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  optimal_time TIMESTAMP WITH TIME ZONE,
  travel_time_minutes INTEGER DEFAULT 0,
  is_dismissed BOOLEAN DEFAULT false,
  is_accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User calendar preferences
CREATE TABLE public.calendar_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_hours_start TIME DEFAULT '09:00',
  work_hours_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sunday, 6=Saturday
  buffer_time_minutes INTEGER DEFAULT 15, -- Time buffer between events
  max_daily_events INTEGER DEFAULT 8,
  auto_suggest_events BOOLEAN DEFAULT true,
  preferred_event_duration INTEGER DEFAULT 120, -- in minutes
  location_radius_km INTEGER DEFAULT 25, -- for location-based suggestions
  notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_event_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_calendars
CREATE POLICY "Users can view their own calendars" 
ON public.user_calendars FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own calendars" 
ON public.user_calendars FOR ALL 
USING (auth.uid() = user_id);

-- RLS Policies for calendar_events
CREATE POLICY "Users can view their own calendar events" 
ON public.calendar_events FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own calendar events" 
ON public.calendar_events FOR ALL 
USING (auth.uid() = user_id);

-- RLS Policies for smart_event_suggestions
CREATE POLICY "Users can view their own event suggestions" 
ON public.smart_event_suggestions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own event suggestions" 
ON public.smart_event_suggestions FOR ALL 
USING (auth.uid() = user_id);

-- RLS Policies for calendar_preferences
CREATE POLICY "Users can view their own calendar preferences" 
ON public.calendar_preferences FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own calendar preferences" 
ON public.calendar_preferences FOR ALL 
USING (auth.uid() = user_id);

-- Function to check for calendar conflicts
CREATE OR REPLACE FUNCTION public.check_calendar_conflicts(
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
) RETURNS TABLE(
  conflict_count INTEGER,
  conflicting_events JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  conflicts JSONB;
BEGIN
  -- Get conflicting events
  SELECT jsonb_agg(
    jsonb_build_object(
      'title', ce.title,
      'start_time', ce.start_time,
      'end_time', ce.end_time,
      'calendar_name', uc.calendar_name
    )
  ) INTO conflicts
  FROM public.calendar_events ce
  JOIN public.user_calendars uc ON ce.calendar_id = uc.id
  WHERE ce.user_id = p_user_id
    AND ce.status = 'confirmed'
    AND (
      (ce.start_time <= p_start_time AND ce.end_time > p_start_time) OR
      (ce.start_time < p_end_time AND ce.end_time >= p_end_time) OR
      (ce.start_time >= p_start_time AND ce.end_time <= p_end_time)
    );
  
  RETURN QUERY SELECT 
    COALESCE(jsonb_array_length(conflicts), 0)::INTEGER,
    COALESCE(conflicts, '[]'::jsonb);
END;
$$;

-- Function to generate smart event suggestions
CREATE OR REPLACE FUNCTION public.generate_smart_suggestions(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_prefs RECORD;
  event_rec RECORD;
  suggestion_reason TEXT;
  confidence DECIMAL(3,2);
  optimal_time TIMESTAMPTZ;
BEGIN
  -- Get user preferences
  SELECT * INTO user_prefs
  FROM public.calendar_preferences
  WHERE user_id = p_user_id;
  
  -- If no preferences, create default ones
  IF user_prefs IS NULL THEN
    INSERT INTO public.calendar_preferences (user_id) VALUES (p_user_id);
    SELECT * INTO user_prefs FROM public.calendar_preferences WHERE user_id = p_user_id;
  END IF;
  
  -- Clear old suggestions (older than 7 days)
  DELETE FROM public.smart_event_suggestions 
  WHERE user_id = p_user_id AND suggested_at < NOW() - INTERVAL '7 days';
  
  -- Generate suggestions for upcoming events
  FOR event_rec IN 
    SELECT e.*, 
           EXTRACT(EPOCH FROM (e.date::timestamptz - NOW()))/3600 as hours_until_event
    FROM public.events e
    WHERE e.date >= NOW()
      AND e.date <= NOW() + INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.smart_event_suggestions ses 
        WHERE ses.user_id = p_user_id AND ses.event_id = e.id AND ses.is_dismissed = false
      )
    ORDER BY e.date
    LIMIT 20
  LOOP
    -- Calculate suggestion reasons and confidence
    suggestion_reason := 'available_time';
    confidence := 0.6;
    optimal_time := event_rec.date::timestamptz;
    
    -- Boost confidence based on user interests (simplified)
    IF event_rec.category IN ('food', 'entertainment', 'culture') THEN
      confidence := confidence + 0.2;
      suggestion_reason := 'similar_interests';
    END IF;
    
    -- Check if user has free time around the event
    IF NOT EXISTS (
      SELECT 1 FROM public.calendar_events ce
      WHERE ce.user_id = p_user_id
        AND ce.status = 'confirmed'
        AND ce.start_time <= event_rec.date::timestamptz + INTERVAL '2 hours'
        AND ce.end_time >= event_rec.date::timestamptz - INTERVAL '1 hour'
    ) THEN
      confidence := confidence + 0.1;
    END IF;
    
    -- Insert suggestion if confidence is high enough
    IF confidence >= 0.5 THEN
      INSERT INTO public.smart_event_suggestions (
        user_id, event_id, reason, confidence_score, optimal_time
      ) VALUES (
        p_user_id, event_rec.id, suggestion_reason, confidence, optimal_time
      );
    END IF;
  END LOOP;
END;
$$;

-- Create indexes for performance
CREATE INDEX idx_calendar_events_user_time ON public.calendar_events(user_id, start_time, end_time);
CREATE INDEX idx_smart_suggestions_user_confidence ON public.smart_event_suggestions(user_id, confidence_score DESC);
CREATE INDEX idx_user_calendars_user_sync ON public.user_calendars(user_id, sync_enabled);

-- Triggers for updated_at
CREATE TRIGGER update_user_calendars_updated_at
  BEFORE UPDATE ON public.user_calendars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_preferences_updated_at
  BEFORE UPDATE ON public.calendar_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();