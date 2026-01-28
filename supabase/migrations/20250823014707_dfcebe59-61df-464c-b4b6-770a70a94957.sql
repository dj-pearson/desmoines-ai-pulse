-- Create function to purge old events and maintain database performance
-- Events older than 6 months will be archived/deleted along with related data

CREATE OR REPLACE FUNCTION public.purge_old_events(retention_months INTEGER DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  cutoff_date DATE;
  events_deleted INTEGER := 0;
  related_data_deleted RECORD;
  result jsonb;
BEGIN
  -- Calculate cutoff date
  cutoff_date := CURRENT_DATE - (retention_months || ' months')::INTERVAL;
  
  -- Log the purge operation start
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🗑️ Starting event purge for events older than ' || cutoff_date, NOW());
  END IF;
  
  -- Count events to be deleted
  SELECT COUNT(*) INTO events_deleted
  FROM public.events 
  WHERE date < cutoff_date;
  
  -- Delete related data first (to avoid foreign key issues)
  
  -- Delete event attendance records
  DELETE FROM public.event_attendance 
  WHERE event_id IN (
    SELECT id FROM public.events WHERE date < cutoff_date
  );
  
  -- Delete event photos
  DELETE FROM public.event_photos 
  WHERE event_id IN (
    SELECT id FROM public.events WHERE date < cutoff_date
  );
  
  -- Delete event reviews
  DELETE FROM public.event_reviews 
  WHERE event_id IN (
    SELECT id FROM public.events WHERE date < cutoff_date
  );
  
  -- Delete event tips
  DELETE FROM public.event_tips 
  WHERE event_id IN (
    SELECT id FROM public.events WHERE date < cutoff_date
  );
  
  -- Delete event social metrics
  DELETE FROM public.event_social_metrics 
  WHERE event_id IN (
    SELECT id FROM public.events WHERE date < cutoff_date
  );
  
  -- Delete content metrics for old events
  DELETE FROM public.content_metrics 
  WHERE content_type = 'event' 
    AND content_id IN (
      SELECT id FROM public.events WHERE date < cutoff_date
    );
  
  -- Delete content performance metrics for old events
  DELETE FROM public.content_performance_metrics 
  WHERE content_type = 'event' 
    AND content_id IN (
      SELECT id FROM public.events WHERE date < cutoff_date
    );
  
  -- Delete content rating aggregates for old events
  DELETE FROM public.content_rating_aggregates 
  WHERE content_type = 'event' 
    AND content_id IN (
      SELECT id FROM public.events WHERE date < cutoff_date
    );
  
  -- Delete trending scores for old events
  DELETE FROM public.trending_scores 
  WHERE content_type = 'event' 
    AND content_id IN (
      SELECT id FROM public.events WHERE date < cutoff_date
    );
  
  -- Delete user ratings for old events
  DELETE FROM public.user_ratings 
  WHERE content_type = 'event' 
    AND content_id IN (
      SELECT id FROM public.events WHERE date < cutoff_date
    );
  
  -- Finally delete the events themselves
  DELETE FROM public.events WHERE date < cutoff_date;
  
  -- Build result summary
  result := jsonb_build_object(
    'status', 'success',
    'cutoff_date', cutoff_date,
    'retention_months', retention_months,
    'events_deleted', events_deleted,
    'message', 'Successfully purged ' || events_deleted || ' events older than ' || cutoff_date,
    'timestamp', NOW()
  );
  
  -- Log the completion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('✅ Event purge completed: ' || events_deleted || ' events deleted (older than ' || cutoff_date || ')', NOW());
  END IF;
  
  RETURN result;
END;
$$;

-- Create cron job to run monthly event purge (1st day of month at 2 AM)
SELECT cron.schedule(
  'monthly-event-purge',
  '0 2 1 * *', -- 2 AM on the 1st day of every month
  $$
  SELECT public.purge_old_events(6); -- Keep 6 months of events
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'monthly-event-purge';

-- Log the setup
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('📅 Monthly event purge cron job scheduled (6 month retention)', NOW());
  END IF;
END $$;