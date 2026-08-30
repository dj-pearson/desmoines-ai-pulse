-- WEB-AUTO-013: subscription lifecycle automation log + daily driver schedule.
--
-- Additive event log so every lifecycle transition (renewal reminder, payment
-- failed, downgrade, win-back) is recorded and MRR/churn is queryable. The
-- daily subscription-lifecycle job (web-billed subs only) reads
-- user_subscriptions and writes here. Apple/Google-billed subs are excluded by
-- the job's platform guard (their stores own dunning).

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid,
  event_type      text NOT NULL,   -- renewal_reminder | payment_failed | downgraded | winback
  platform        text,
  details         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user
  ON public.subscription_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type
  ON public.subscription_events (event_type, created_at);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Admins read the log for the dashboard; writes happen via the service role.
DROP POLICY IF EXISTS "subscription_events_admin_select" ON public.subscription_events;
CREATE POLICY "subscription_events_admin_select"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.subscription_events IS
  'WEB-AUTO-013: lifecycle transitions for web-billed subscriptions (MRR/churn analytics).';

-- Daily lifecycle driver (08:00 UTC).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('subscription-lifecycle')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-lifecycle');

    PERFORM cron.schedule(
      'subscription-lifecycle',
      '0 8 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/subscription-lifecycle',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        )
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
