-- =============================================================================
-- Apple App Store Server Notifications v2 — idempotency log
-- =============================================================================
-- Records every Apple notification we receive, keyed by Apple's
-- `notificationUUID`. Apple delivers at-least-once and retries up to 5×, so we
-- need a stable de-dupe key so the appstore-server-notifications-v2 webhook
-- can short-circuit duplicates instead of double-applying state changes.
--
-- Also doubles as an audit trail for support and on-call debugging.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.apple_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_uuid TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  subtype TEXT,
  original_transaction_id TEXT,
  user_subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: notification_uuid must be unique. Apple guarantees this is a
-- per-notification UUID, even across retries.
CREATE UNIQUE INDEX IF NOT EXISTS apple_notification_log_uuid_key
  ON public.apple_notification_log (notification_uuid);

-- Frequent lookup paths: by originalTransactionId (when reconciling), and by
-- recency for support tooling.
CREATE INDEX IF NOT EXISTS apple_notification_log_original_tx_idx
  ON public.apple_notification_log (original_transaction_id);

CREATE INDEX IF NOT EXISTS apple_notification_log_processed_at_idx
  ON public.apple_notification_log (processed_at DESC);

-- RLS — service role only. The webhook runs with the service role and no
-- end-user should ever read this table directly.
ALTER TABLE public.apple_notification_log ENABLE ROW LEVEL SECURITY;

-- No public policies. Admins can read via service role + Postgres functions.

COMMENT ON TABLE public.apple_notification_log IS
  'Idempotency + audit log for Apple App Store Server Notifications v2. Keyed by Apple notificationUUID.';
COMMENT ON COLUMN public.apple_notification_log.status IS
  'applied | no_match | skipped_no_transaction | error';
