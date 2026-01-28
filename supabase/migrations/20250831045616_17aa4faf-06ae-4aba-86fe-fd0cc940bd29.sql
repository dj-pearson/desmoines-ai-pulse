-- Create social media automation scheduling
CREATE TABLE IF NOT EXISTS public.social_media_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_type TEXT NOT NULL, -- 'event' or 'restaurant'
  scheduled_time TIME NOT NULL, -- Time of day to post
  timezone TEXT DEFAULT 'America/Chicago',
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_media_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access only
DO $$ BEGIN
  CREATE POLICY "Admins can manage social media schedules" 
  ON public.social_media_schedules 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND user_role IN ('root_admin', 'admin')
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- Insert default schedules for events at 9 AM and restaurants at 6 PM
INSERT INTO public.social_media_schedules (schedule_type, scheduled_time, next_run) VALUES
('event', '09:00:00', DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + INTERVAL '9 hours'),
('restaurant', '18:00:00', 
  CASE 
    WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN DATE_TRUNC('day', NOW()) + INTERVAL '18 hours'
    ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + INTERVAL '18 hours'
  END
);

-- Create function to handle automated social media posting
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  schedule_rec RECORD;
  next_run_time TIMESTAMPTZ;
  post_data JSONB;
  http_result INTEGER;
BEGIN
  -- Log the automation run
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🤖 Social media automation check started', NOW());
  END IF;

  -- Process due schedules
  FOR schedule_rec IN 
    SELECT * FROM public.social_media_schedules 
    WHERE is_active = true 
      AND next_run <= NOW()
  LOOP
    BEGIN
      -- Generate the appropriate post type
      SELECT net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM'
        ),
        body := jsonb_build_object(
          'action', 'generate_and_publish',
          'contentType', schedule_rec.schedule_type,
          'subjectType', schedule_rec.schedule_type || '_of_the_day',
          'autoPublish', true
        )::text
      ) INTO http_result;

      -- Calculate next run time (next day at same time)
      next_run_time := DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + schedule_rec.scheduled_time::INTERVAL;

      -- Update schedule
      UPDATE public.social_media_schedules 
      SET 
        last_run = NOW(),
        next_run = next_run_time,
        updated_at = NOW()
      WHERE id = schedule_rec.id;

      -- Log successful execution
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✅ Social media post generated and published: ' || schedule_rec.schedule_type, NOW());
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Log error and reschedule for 1 hour later
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES (
          '❌ Social media automation failed for: ' || schedule_rec.schedule_type,
          SQLERRM,
          NOW()
        );
      END IF;

      -- Reschedule for 1 hour later
      UPDATE public.social_media_schedules 
      SET next_run = NOW() + INTERVAL '1 hour'
      WHERE id = schedule_rec.id;
    END;
  END LOOP;

  -- Log completion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🤖 Social media automation check completed', NOW());
  END IF;
END;
$$;

-- Add social media automation to the main cron function
CREATE OR REPLACE FUNCTION public.run_scraping_jobs_simple()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
  schedules_updated INTEGER := 0;
BEGIN
  -- Log the cron job execution
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('Starting enhanced cron job run (auto-detects schedule changes)', NOW());
  END IF;
  
  -- First, update any jobs where the schedule has changed but next_run wasn't recalculated
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE (config->>'isActive')::boolean = true
      AND updated_at > COALESCE(last_run, '1970-01-01'::timestamptz)
      AND status != 'running'
  LOOP
    -- Recalculate next_run based on current schedule
    next_run_time := CASE 
      WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
      WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
      WHEN job_record.config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
      WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
      WHEN job_record.config->>'schedule' = '0 */4 * * *' THEN NOW() + INTERVAL '4 hours'
      WHEN job_record.config->>'schedule' = '0 */2 * * *' THEN NOW() + INTERVAL '2 hours'
      WHEN job_record.config->>'schedule' = '0 */1 * * *' THEN NOW() + INTERVAL '1 hour'
      WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
        CASE 
          WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
          ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
        END
      WHEN job_record.config->>'schedule' = '0 18 * * *' THEN 
        CASE 
          WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN DATE_TRUNC('day', NOW()) + INTERVAL '18 hours'
          ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
        END
      ELSE NOW() + INTERVAL '6 hours'
    END;
    
    UPDATE public.scraping_jobs 
    SET next_run = next_run_time
    WHERE id = job_record.id;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, job_id, created_at) 
      VALUES ('🔄 Auto-updated schedule for: ' || job_record.name || ' (new next run: ' || next_run_time || ')', job_record.id, NOW());
    END IF;
    
    schedules_updated := schedules_updated + 1;
  END LOOP;
  
  -- Process jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE status != 'running' 
      AND next_run <= NOW()
      AND (config->>'isActive')::boolean = true
  LOOP
    BEGIN
      next_run_time := CASE 
        WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
        WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
        WHEN job_record.config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
        WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
        WHEN job_record.config->>'schedule' = '0 */4 * * *' THEN NOW() + INTERVAL '4 hours'
        WHEN job_record.config->>'schedule' = '0 */2 * * *' THEN NOW() + INTERVAL '2 hours'
        WHEN job_record.config->>'schedule' = '0 */1 * * *' THEN NOW() + INTERVAL '1 hour'
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
          CASE 
            WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
          END
        WHEN job_record.config->>'schedule' = '0 18 * * *' THEN 
          CASE 
            WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
          END
        ELSE NOW() + INTERVAL '6 hours'
      END;
      
      UPDATE public.scraping_jobs 
      SET 
        status = 'scheduled_for_trigger',
        next_run = next_run_time,
        last_run = NOW(),
        updated_at = NOW()
      WHERE id = job_record.id;
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('🔵 Job scheduled for manual trigger: ' || job_record.name || ' (next run: ' || next_run_time || ')', job_record.id, NOW());
      END IF;
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES (
          '❌ Error processing job: ' || job_record.name, 
          job_record.id,
          SQLERRM,
          NOW()
        );
      END IF;
      
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
    END;
  END LOOP;
  
  -- Run social media automation check
  PERFORM public.run_social_media_automation();
  
  -- Trigger AI enhancement when we process jobs
  IF jobs_processed > 0 AND (jobs_processed % 20 = 0 OR (EXTRACT(HOUR FROM NOW()) IN (6, 18) AND jobs_processed > 0)) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🤖 Triggering AI bulk enhancement (processed ' || jobs_processed || ' jobs or scheduled time)', NOW());
    END IF;
    
    BEGIN
      PERFORM net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/bulk-enhance-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM'
        ),
        body := jsonb_build_object(
          'batchSize', 15,
          'triggerSource', 'cron'
        )::text
      );
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✨ AI bulk enhancement triggered successfully (batch size: 15)', NOW());
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES ('❌ Failed to trigger AI bulk enhancement', SQLERRM, NOW());
      END IF;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('✅ Enhanced cron completed. Updated ' || schedules_updated || ' schedules, processed ' || jobs_processed || ' jobs.', NOW());
  END IF;
  
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$;