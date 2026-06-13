-- WEB-AUTO-009: server-side moderation triggers + sweep schedule.
--
-- Reviews (user_ratings): the web client invokes moderate-content directly with
-- the author's JWT right after insert (so the author gets an immediate verdict),
-- and the sweep below is the fail-open safety net for any that stay 'pending'.
--
-- Contact submissions are usually anonymous, so they CANNOT self-invoke the
-- (auth-gated) edge function from the browser. Instead an AFTER INSERT trigger
-- enqueues moderation server-side via pg_net with the service-role bearer — no
-- anonymous caller ever reaches Claude (closes the WEB-SEC-001 cost-abuse hole).

-- ---------------------------------------------------------------------------
-- Contact: enqueue moderation on insert (best-effort; never blocks the insert).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_contact_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/moderate-content',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'db-trigger'
        ),
        body := jsonb_build_object('contentType', 'contact', 'contentId', NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Moderation enqueue must never break contact intake. A missed enqueue is
    -- covered by the contact row staying visible (admin-only) and re-runnable.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_moderation ON public.contact_submissions;
CREATE TRIGGER trg_contact_moderation
  AFTER INSERT ON public.contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_contact_moderation();

-- ---------------------------------------------------------------------------
-- Sweep: re-moderate any reviews stuck in 'pending' (e.g. the inline client
-- invoke failed). Every 15 minutes; the edge function bounds the batch.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('moderate-content-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'moderate-content-sweep');

    PERFORM cron.schedule(
      'moderate-content-sweep',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/moderate-content',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('mode', 'sweep')
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
