-- Fix function search path security issues for social event functions

CREATE OR REPLACE FUNCTION update_event_live_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update event live stats when checkins, discussions, or attendees change
  INSERT INTO public.event_live_stats (
    event_id,
    current_attendees,
    total_checkins,
    discussion_count,
    last_activity
  )
  SELECT 
    e.id as event_id,
    COALESCE(attendee_counts.going_count, 0) as current_attendees,
    COALESCE(checkin_counts.total_checkins, 0) as total_checkins,
    COALESCE(discussion_counts.discussion_count, 0) as discussion_count,
    now() as last_activity
  FROM public.events e
  LEFT JOIN (
    SELECT event_id, COUNT(*) as going_count 
    FROM public.event_attendees 
    WHERE status = 'going' 
    GROUP BY event_id
  ) attendee_counts ON e.id = attendee_counts.event_id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as total_checkins 
    FROM public.event_checkins 
    GROUP BY event_id
  ) checkin_counts ON e.id = checkin_counts.event_id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as discussion_count 
    FROM public.event_discussions 
    GROUP BY event_id
  ) discussion_counts ON e.id = discussion_counts.event_id
  WHERE e.id = COALESCE(NEW.event_id, OLD.event_id)
  ON CONFLICT (event_id) 
  DO UPDATE SET
    current_attendees = EXCLUDED.current_attendees,
    total_checkins = EXCLUDED.total_checkins,
    discussion_count = EXCLUDED.discussion_count,
    last_activity = EXCLUDED.last_activity,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION create_live_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Create feed item for new checkins
  IF TG_TABLE_NAME = 'event_checkins' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.event_live_feed (
      event_id, user_id, content_type, content, metadata
    ) VALUES (
      NEW.event_id, 
      NEW.user_id, 
      'checkin',
      'checked in to the event',
      jsonb_build_object('checkin_method', NEW.check_in_method)
    );
  END IF;

  -- Create feed item for new discussions
  IF TG_TABLE_NAME = 'event_discussions' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.event_live_feed (
      event_id, user_id, content_type, content, media_url, metadata
    ) VALUES (
      NEW.event_id,
      NEW.user_id,
      NEW.message_type,
      NEW.message,
      NEW.media_url,
      jsonb_build_object('discussion_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';