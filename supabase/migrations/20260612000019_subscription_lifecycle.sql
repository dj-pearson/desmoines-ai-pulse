-- WEB-AUTO-013: Subscription lifecycle automation (dunning, renewal reminders, win-back).
--
-- Stripe webhooks already update user_subscriptions.status, but nothing emailed
-- the user, escalated dunning, downgraded after final failure, or offered a
-- win-back. This migration adds:
--   1. subscription_events — an additive, append-only audit log of every
--      lifecycle transition + automated comm (so MRR/churn is queryable and the
--      daily job can frequency-cap itself).
--   2. A system_settings pause flag for the new subscription-lifecycle job.
--   3. A daily cron that drives the subscription-lifecycle edge function through
--      the WEB-AUTO-001 jobRunner (Job Health panel + watchdog alerts).
--
-- Additive + idempotent only (no drops). WEB-ONLY scope is enforced in the edge
-- function (guard on user_subscriptions.platform = 'web'); Apple/Google-billed
-- subscriptions own their own dunning via the stores.

-- 1. Lifecycle audit/event log -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id UUID,                       -- user_subscriptions.id (no FK: row may be deleted)
  stripe_subscription_id TEXT,
  platform TEXT DEFAULT 'web',
  -- e.g. payment_failed | payment_recovered | renewal_reminder_sent |
  --      dunning_email_sent | downgraded | canceled | winback_sent | reactivated
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'usd',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON public.subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe_sub ON public.subscription_events(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON public.subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created ON public.subscription_events(created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Admin-read only; all writes go through the service role (edge fns) which
-- bypasses RLS. No client-side INSERT path.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_events'
      AND policyname = 'Admins can read subscription events'
  ) THEN
    CREATE POLICY "Admins can read subscription events"
      ON public.subscription_events
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

GRANT SELECT ON public.subscription_events TO authenticated;

-- 2. Pause flag (admin-toggleable; service_role bypasses RLS so the edge fn
--    reads it freely). settings = { paused: bool }.
INSERT INTO public.system_settings (setting_type, settings)
SELECT 'subscription_lifecycle', jsonb_build_object('paused', false)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_type = 'subscription_lifecycle'
);

-- 3. Daily cron: 15:00 UTC (~9-10am Central). One run sends renewal reminders
--    (7 days out), escalates dunning on past_due subs, downgrades after the
--    final failure, and offers a one-per-lapse win-back after cancellation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('subscription-lifecycle-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-lifecycle-daily');

    PERFORM cron.schedule(
      'subscription-lifecycle-daily',
      '0 15 * * *',  -- 15:00 UTC daily (~9-10am Central)
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/subscription-lifecycle',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('triggerSource', 'cron')
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
