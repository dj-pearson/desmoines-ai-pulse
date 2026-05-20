-- EMAIL-SCHED-001: Cron-driven dispatch of scheduled newsletter campaigns.
--
-- The atomic-claim RPC ensures a single worker invocation picks up a
-- given row by flipping status='scheduled' → 'sending' under a single
-- UPDATE...RETURNING. Concurrent or duplicate cron firings see no
-- claimable rows and exit clean.

CREATE OR REPLACE FUNCTION public.claim_scheduled_newsletter_campaigns(
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  subject TEXT,
  preheader TEXT,
  body_html TEXT,
  segment JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT c.id
    FROM public.newsletter_campaigns c
    WHERE c.status = 'scheduled'
      AND c.scheduled_for IS NOT NULL
      AND c.scheduled_for <= now()
    ORDER BY c.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.newsletter_campaigns c
  SET status = 'sending',
      updated_at = now()
  FROM due
  WHERE c.id = due.id
  RETURNING c.id, c.subject, c.preheader, c.body_html, c.segment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_scheduled_newsletter_campaigns(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_scheduled_newsletter_campaigns(INTEGER) IS
  'Atomically claims up to p_limit scheduled newsletter campaigns whose scheduled_for is past, flipping status to sending. Called once per minute by the dispatch-scheduled-newsletters edge function via pg_cron.';

-- Schedule the dispatcher. Follows the established pattern from
-- 20250107000006_schedule_event_scraping.sql: pg_cron + net.http_post
-- with the service-role bearer + supabase_url pulled from session
-- settings.
DO $$ BEGIN
  PERFORM cron.unschedule('dispatch-scheduled-newsletters');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'dispatch-scheduled-newsletters',
  '* * * * *',  -- every minute
  $cron$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/dispatch-scheduled-newsletters',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json',
        'x-trigger-source', 'cron-auto'
      )
    ) AS request_id;
  $cron$
);
