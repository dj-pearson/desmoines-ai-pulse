-- Fix RLS policies for event tables to prevent 406 errors

-- Ensure event_live_stats has proper policies
DROP POLICY IF EXISTS "Anyone can view event live stats" ON public.event_live_stats;
CREATE POLICY "Anyone can view event live stats" 
ON public.event_live_stats 
FOR SELECT 
USING (true);

-- Allow service role to manage event_live_stats
CREATE POLICY "Service role can manage event live stats" 
ON public.event_live_stats 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Ensure event_attendees has proper policies for anonymous access
DROP POLICY IF EXISTS "Users can view public attendee status" ON public.event_attendees;
CREATE POLICY "Anyone can view attendee status" 
ON public.event_attendees 
FOR SELECT 
USING (true);

-- Ensure event_checkins has proper policies for anonymous access  
DROP POLICY IF EXISTS "Users can view public event checkins" ON public.event_checkins;
CREATE POLICY "Anyone can view event checkins" 
ON public.event_checkins 
FOR SELECT 
USING (true);

-- Create function to populate missing event_live_stats
CREATE OR REPLACE FUNCTION populate_event_live_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Insert missing event_live_stats records for all events
  INSERT INTO public.event_live_stats (
    event_id,
    current_attendees,
    total_checkins,
    discussion_count,
    photos_count,
    trending_score,
    last_activity
  )
  SELECT DISTINCT
    e.id as event_id,
    COALESCE(attendee_counts.count, 0) as current_attendees,
    COALESCE(checkin_counts.count, 0) as total_checkins,
    COALESCE(discussion_counts.count, 0) as discussion_count,
    0 as photos_count,
    0 as trending_score,
    now() as last_activity
  FROM public.events e
  LEFT JOIN (
    SELECT event_id, COUNT(*) as count
    FROM public.event_attendees
    WHERE status IN ('going', 'interested')
    GROUP BY event_id
  ) attendee_counts ON attendee_counts.event_id = e.id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as count
    FROM public.event_checkins
    GROUP BY event_id
  ) checkin_counts ON checkin_counts.event_id = e.id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as count
    FROM public.event_discussions
    GROUP BY event_id
  ) discussion_counts ON discussion_counts.event_id = e.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_live_stats els 
    WHERE els.event_id = e.id
  );
END;
$$;

-- Execute the function to populate missing data
SELECT populate_event_live_stats();