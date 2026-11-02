-- Record which Apple environment an iOS subscription row was validated in
-- (WEB-SEC-051).
--
-- validate-ios-receipt falls back to Apple's sandbox API when production
-- answers 404, which App Review needs (it buys in the sandbox against the
-- production backend). The row did not say which environment it came from, so
-- a TestFlight sandbox purchase was indistinguishable from a paid one.
--
-- Additive and nullable: existing rows stay NULL (unknown), older function
-- versions never write it, and validate-ios-receipt writes it in a separate
-- best-effort UPDATE so it works before and after this is applied.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS apple_environment text NULL;

COMMENT ON COLUMN public.user_subscriptions.apple_environment IS
  'Apple App Store Server API environment the iOS transaction was verified in: Production or Sandbox. NULL for non-iOS rows and rows validated before 20261102000001.';
