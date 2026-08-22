-- WEB-BE-030 AC1: the two billing-webhook audit tables.
--
-- Both webhooks already write to these tables and already read them for their
-- idempotency guard. Neither table has ever existed, confirmed against
-- production 2026-08-22: to_regclass('public.apple_notification_log') and
-- ('public.play_rtdn_log') both return NULL.
--
-- AC2 and AC3 were completed in code earlier: the webhooks now destructure
-- { data, error } from the lookup and log loudly when it fails, instead of
-- destructuring only { data } and reading a missing relation as "never seen
-- this notification". Until these tables exist, that is exactly what still
-- happens in production -- the code is correct and the storage it needs is
-- absent, so every retry is reprocessed.
--
-- Google Play uses AT-LEAST-ONCE delivery, so duplicate message_ids arrive in
-- normal operation, not only during incidents. That is the case this closes.
--
-- THE UNIQUE CONSTRAINT IS THE POINT. The guard is a lookup on the provider's
-- own idempotency key, so that key carries a UNIQUE index here: it makes a
-- duplicate impossible to insert even if two deliveries race past the SELECT,
-- which a lookup alone cannot prevent.
--
-- Column sets are taken from what the functions actually insert, not invented:
--   play-rtdn-webhook/index.ts               message_id, notification_type,
--     purchase_token, subscription_id, user_subscription_id, processed_at,
--     status, error_message
--   appstore-server-notifications-v2/index.ts  notification_uuid,
--     notification_type, subtype, original_transaction_id,
--     user_subscription_id, processed_at, status, error_message
-- Both also `.select('id, processed_at')`, so both need id and processed_at.
-- notification_type is NULLABLE because the Play webhook inserts null on its
-- skipped_no_payload path.
--
-- RLS follows the automation_job_runs convention for internal logs: admin read
-- only, no anon access, no client write path. The edge functions use the
-- service-role key, which bypasses RLS. Deliberately NOT world-readable --
-- these rows carry purchase tokens and original transaction ids, and
-- WEB-SEC-021 is this repo's lesson about internal tables shipping readable.
--
-- CREATE TABLE is additive and safe in a single release per CLAUDE.md.

CREATE TABLE IF NOT EXISTS public.apple_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_uuid TEXT NOT NULL,
  notification_type TEXT,
  subtype TEXT,
  original_transaction_id TEXT,
  user_subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT apple_notification_log_uuid_unique UNIQUE (notification_uuid)
);

CREATE TABLE IF NOT EXISTS public.play_rtdn_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  notification_type TEXT,
  purchase_token TEXT,
  subscription_id TEXT,
  user_subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT play_rtdn_log_message_id_unique UNIQUE (message_id)
);

-- The webhooks look up by the idempotency key on every delivery, so it is the
-- index that matters. UNIQUE above already provides it; these cover the
-- operational queries an admin runs when reconciling a billing dispute.
CREATE INDEX IF NOT EXISTS idx_apple_notification_log_processed_at
  ON public.apple_notification_log (processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_apple_notification_log_subscription
  ON public.apple_notification_log (user_subscription_id)
  WHERE user_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_play_rtdn_log_processed_at
  ON public.play_rtdn_log (processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_rtdn_log_subscription
  ON public.play_rtdn_log (user_subscription_id)
  WHERE user_subscription_id IS NOT NULL;

ALTER TABLE public.apple_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_rtdn_log ENABLE ROW LEVEL SECURITY;

-- Admin read only. No INSERT/UPDATE/DELETE policy exists for any client role,
-- so with RLS on, only the service-role key the webhooks use can write.
DROP POLICY IF EXISTS apple_notification_log_admin_read ON public.apple_notification_log;
CREATE POLICY apple_notification_log_admin_read
  ON public.apple_notification_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS play_rtdn_log_admin_read ON public.play_rtdn_log;
CREATE POLICY play_rtdn_log_admin_read
  ON public.play_rtdn_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.apple_notification_log IS
  'WEB-BE-030. Audit trail and idempotency store for App Store Server Notifications v2. notification_uuid is UNIQUE: it is the key appstore-server-notifications-v2 looks up before processing.';
COMMENT ON TABLE public.play_rtdn_log IS
  'WEB-BE-030. Audit trail and idempotency store for Google Play RTDN. message_id is UNIQUE: Play delivers at-least-once, so duplicates are normal traffic rather than an incident signal.';
