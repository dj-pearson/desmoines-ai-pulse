-- Image backfill backlog drain: track when each row was last considered for an
-- image so the automated backfill (1) prioritizes never-checked rows and
-- (2) stops re-trying permanent failures every run. Additive + safe per the
-- backward-compatibility rules (ADD COLUMN NULL, partial indexes, new cron).

-- 1) Additive column on every table backfill-images processes.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ;
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ;
ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ;
ALTER TABLE public.playgrounds
  ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.events.image_checked_at IS
  'Last time backfill-images attempted to find an image for this row (success or fail). Drives the backlog-drain ordering + the 7-day retry window.';

-- 2) Partial indexes so the "needs an image and is due for a (re)check" query
--    is cheap. Only indexes imageless rows (the working set), kept small.
CREATE INDEX IF NOT EXISTS idx_events_image_backfill
  ON public.events (image_checked_at NULLS FIRST)
  WHERE image_url IS NULL OR image_url = '';
CREATE INDEX IF NOT EXISTS idx_restaurants_image_backfill
  ON public.restaurants (image_checked_at NULLS FIRST)
  WHERE image_url IS NULL OR image_url = '';
CREATE INDEX IF NOT EXISTS idx_attractions_image_backfill
  ON public.attractions (image_checked_at NULLS FIRST)
  WHERE image_url IS NULL OR image_url = '';
CREATE INDEX IF NOT EXISTS idx_playgrounds_image_backfill
  ON public.playgrounds (image_checked_at NULLS FIRST)
  WHERE image_url IS NULL OR image_url = '';

-- 3) Schedule the automated drain. Events (the largest, most time-sensitive
--    source) hourly; restaurants/attractions every 6 hours. Each run processes a
--    capped batch (25) of the oldest-unchecked imageless rows. This complements
--    the nightly data-quality-heal pass rather than replacing it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('backfill-images-events')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-images-events');
    PERFORM cron.unschedule('backfill-images-restaurants')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-images-restaurants');
    PERFORM cron.unschedule('backfill-images-attractions')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-images-attractions');

    PERFORM cron.schedule(
      'backfill-images-events',
      '7 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/backfill-images',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('category', 'events', 'batchSize', 25)
      ) as request_id;
      $cron$
    );

    PERFORM cron.schedule(
      'backfill-images-restaurants',
      '23 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/backfill-images',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('category', 'restaurants', 'batchSize', 25)
      ) as request_id;
      $cron$
    );

    PERFORM cron.schedule(
      'backfill-images-attractions',
      '43 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/backfill-images',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('category', 'attractions', 'batchSize', 25)
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
