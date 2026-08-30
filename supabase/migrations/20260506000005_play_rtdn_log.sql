-- =============================================================================
-- SUPERSEDED AND UNRUNNABLE -- DO NOT EDIT, DO NOT RELY ON THIS FILE
-- =============================================================================
-- This migration has NEVER RUN and never will. Its version number, 20260506000005, is
-- already recorded in supabase_migrations.schema_migrations under the name
-- 'seed_blog_queue_competitor_research' -- a DIFFERENT migration was applied under this
-- version. `supabase db push` skips any version already in the ledger, so the
-- SQL below is dead.
--
-- It also means a version-only drift check reports this as "applied" while
-- public.play_rtdn_log does not exist. That is exactly what happened: the
-- table was absent from production for months while every audit said in sync.
--
-- The live definition is 20260822000005_billing_webhook_audit_logs.sql, which
-- takes a fresh version and therefore actually applies. It differs from the
-- SQL below in two ways that matter:
--   * notification_type is NULLABLE. The Play webhook inserts null on its
--     skipped_no_payload path, which the NOT NULL below would have rejected.
--   * the idempotency key carries a UNIQUE constraint, without which a
--     SELECT-then-INSERT guard cannot stop two concurrent deliveries.
--
-- Kept rather than deleted so the history is legible (WEB-BE-030).
-- =============================================================================

-- =============================================================================
-- Google Play Real-Time Developer Notifications (RTDN) — idempotency log
-- =============================================================================
-- Records every Play RTDN message we receive, keyed by Pub/Sub `messageId`.
-- Pub/Sub guarantees at-least-once delivery (and resends if we don't ack
-- within ack-deadline), so we need a stable de-dupe key so the
-- play-rtdn-webhook can short-circuit duplicates instead of double-applying
-- state changes.
--
-- Doubles as an audit trail for support and on-call debugging.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.play_rtdn_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  notification_type TEXT,
  purchase_token TEXT,
  subscription_id TEXT,
  user_subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: Pub/Sub messageId is unique per delivery attempt. Pub/Sub will
-- redeliver with the same messageId if we don't ack in time.
CREATE UNIQUE INDEX IF NOT EXISTS play_rtdn_log_message_id_key
  ON public.play_rtdn_log (message_id);

-- Frequent lookup paths: by purchaseToken (when reconciling), by recency.
CREATE INDEX IF NOT EXISTS play_rtdn_log_purchase_token_idx
  ON public.play_rtdn_log (purchase_token);

CREATE INDEX IF NOT EXISTS play_rtdn_log_processed_at_idx
  ON public.play_rtdn_log (processed_at DESC);

-- RLS — service role only. The webhook runs with the service role and no
-- end-user should ever read this table directly.
ALTER TABLE public.play_rtdn_log ENABLE ROW LEVEL SECURITY;

-- No public policies. Admins can read via service role + Postgres functions.

COMMENT ON TABLE public.play_rtdn_log IS
  'Idempotency + audit log for Google Play Real-Time Developer Notifications. Keyed by Pub/Sub messageId.';
COMMENT ON COLUMN public.play_rtdn_log.status IS
  'applied | no_match | skipped_no_payload | fetch_error';
