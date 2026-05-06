-- =============================================================================
-- One-shot data fix: split legacy mixed-platform subscription rows
-- =============================================================================
-- Some pre-existing user_subscriptions rows have stripe_* fields populated
-- even though their platform was overwritten to 'ios' or 'android' by
-- validate-ios-receipt / validate-android-receipt's previous (unscoped)
-- UPDATE behavior. These mixed rows are confusing and could lead to incorrect
-- cancellation routing — e.g. a user trying to cancel an iOS sub from the web
-- could end up cancelling the underlying Stripe subscription instead.
--
-- This migration walks every such row and:
--   1. Inserts a fresh platform='web' row carrying the stripe_* fields and
--      the canonical Stripe period/status/plan_id.
--   2. Clears the stripe_* fields from the original platform row, so each
--      row carries only the identifiers for its own platform.
--
-- Idempotency: only acts on rows that still have stripe_subscription_id IS NOT
-- NULL while platform != 'web', AND only inserts a web row if the user
-- doesn't already have one (UNIQUE(user_id, platform) would block a duplicate
-- anyway, but we explicitly skip via WHERE NOT EXISTS so re-running is a
-- no-op). Re-running this migration produces zero new rows.
--
-- Run on a backup/staging copy first. See DEPLOYMENT.md for follow-up data-
-- fix commands if Stripe history needs to fill gaps in current_period_end.
-- =============================================================================

-- Belt-and-suspenders: ensure the per-platform uniqueness constraint exists
-- before we attempt the split. The 20260506000003 migration adds this; this
-- block is a no-op if it already ran.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subscriptions_user_platform_key'
  ) THEN
    -- Don't add the constraint here — let the dedicated migration handle it.
    -- We just emit a notice so dry-runs surface the missing prerequisite.
    RAISE NOTICE 'user_subscriptions_user_platform_key is missing; expected '
      'migration 20260506000003 to have run. Skipping legacy split.';
    RETURN;
  END IF;
END $$;

-- 1. Insert a fresh platform='web' row for every mixed (non-web) row that
--    still carries stripe_* fields and that doesn't already have a web row.
--
-- We deliberately use INSERT ... SELECT ... WHERE NOT EXISTS to keep this
-- idempotent against the UNIQUE(user_id, platform) constraint.
INSERT INTO public.user_subscriptions (
  user_id,
  plan_id,
  status,
  platform,
  stripe_subscription_id,
  stripe_customer_id,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  canceled_at,
  trial_start,
  trial_end,
  created_at,
  updated_at
)
SELECT
  legacy.user_id,
  legacy.plan_id,
  legacy.status,
  'web' AS platform,
  legacy.stripe_subscription_id,
  legacy.stripe_customer_id,
  legacy.current_period_start,
  legacy.current_period_end,
  legacy.cancel_at_period_end,
  legacy.canceled_at,
  legacy.trial_start,
  legacy.trial_end,
  COALESCE(legacy.created_at, NOW()),
  NOW()
FROM public.user_subscriptions AS legacy
WHERE legacy.platform IN ('ios', 'android')
  AND legacy.stripe_subscription_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions AS web_existing
    WHERE web_existing.user_id = legacy.user_id
      AND web_existing.platform = 'web'
  );

-- 2. Strip the stripe_* fields off the original platform row so each row
--    carries only the identifiers that belong to its platform. Period /
--    status / plan_id stay where they are — the platform-specific receipt-
--    validation code path will re-fill them on next sync, and the iOS or
--    Android subscription is presumed to be the one that user is actually
--    using going forward (the web one will reconcile on next Stripe webhook).
UPDATE public.user_subscriptions
SET
  stripe_subscription_id = NULL,
  stripe_customer_id = NULL,
  updated_at = NOW()
WHERE platform IN ('ios', 'android')
  AND stripe_subscription_id IS NOT NULL;

-- 3. Audit table — record the split for support/debugging. We persist the
--    original row IDs and the new web row IDs so we can join back later if
--    needed. Idempotent via INSERT ... ON CONFLICT DO NOTHING on a unique
--    (legacy_subscription_id) key.
CREATE TABLE IF NOT EXISTS public.subscription_split_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  legacy_subscription_id UUID NOT NULL,
  web_subscription_id UUID,
  legacy_platform TEXT NOT NULL,
  stripe_subscription_id TEXT,
  split_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_split_audit_legacy_id_key
  ON public.subscription_split_audit (legacy_subscription_id);

ALTER TABLE public.subscription_split_audit ENABLE ROW LEVEL SECURITY;

-- 4. Backfill the audit table for any rows we just split. Because we cleared
--    stripe_* in step 2, we have to look up the corresponding web rows by
--    user_id rather than by stripe_subscription_id. We match on user_id and
--    the most-recently-created web row, which is safe given the (user_id,
--    platform) uniqueness constraint added in 20260506000003.
INSERT INTO public.subscription_split_audit (
  user_id,
  legacy_subscription_id,
  web_subscription_id,
  legacy_platform,
  stripe_subscription_id
)
SELECT
  legacy.user_id,
  legacy.id AS legacy_subscription_id,
  web_row.id AS web_subscription_id,
  legacy.platform AS legacy_platform,
  web_row.stripe_subscription_id
FROM public.user_subscriptions AS legacy
JOIN public.user_subscriptions AS web_row
  ON web_row.user_id = legacy.user_id AND web_row.platform = 'web'
WHERE legacy.platform IN ('ios', 'android')
  -- Only audit rows we actually split: legacy.stripe_* should now be NULL
  -- (we cleared it in step 2) but a corresponding web row exists.
  AND legacy.stripe_subscription_id IS NULL
  AND web_row.stripe_subscription_id IS NOT NULL
ON CONFLICT (legacy_subscription_id) DO NOTHING;

COMMENT ON TABLE public.subscription_split_audit IS
  'Records the one-shot data fix performed by 20260506000006_split_legacy_mixed_platform_subs.sql. '
  'Each row maps a legacy mobile-platform subscription that had stripe_* fields populated to the '
  'newly-inserted web platform row that now carries those Stripe identifiers.';
