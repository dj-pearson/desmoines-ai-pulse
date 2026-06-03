-- Stripe webhook idempotency ledger
--
-- Stripe delivers webhook events "at least once" and retries on any non-2xx
-- response (or network timeout). Without event-level deduplication, a redelivery
-- of e.g. checkout.session.completed re-runs the handler and re-inserts
-- campaign_notifications (duplicate advertiser + admin alerts), even though the
-- payments upsert is already idempotent.
--
-- The stripe-webhook edge function records each FULLY-processed event id here and
-- skips any event id it has already processed. Recording happens only after the
-- handler succeeds, so an event that fails mid-processing (function returns 5xx)
-- is left unrecorded and is safely reprocessed on Stripe's retry.
--
-- Additive / backward-compatible: CREATE TABLE only (no changes to existing
-- shapes), safe to ship in a single release per the backward-compatibility flow.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id           text PRIMARY KEY,                       -- Stripe event id (evt_...)
  event_type   text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS with NO policies: anon/authenticated get deny-all. The webhook
-- runs with the service_role key, which bypasses RLS, so it can read/write while
-- no browser client can ever touch this internal ledger.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency ledger of fully-processed Stripe webhook event ids. Written by the stripe-webhook edge function (service_role). No client access.';

-- Retention helper: the ledger only needs enough history to cover Stripe''s
-- retry window (up to ~3 days). Older rows can be pruned by a scheduled job;
-- index supports that cleanup without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events (processed_at);
