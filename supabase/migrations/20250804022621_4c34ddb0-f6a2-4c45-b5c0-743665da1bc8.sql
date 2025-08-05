-- Fix security warnings: Add search_path to new functions
CREATE OR REPLACE FUNCTION public.check_calendar_conflicts(
  p_user_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
) RETURNS TABLE(
  conflict_count INTEGER,
  conflicting_events JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION public.generate_smart_suggestions(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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