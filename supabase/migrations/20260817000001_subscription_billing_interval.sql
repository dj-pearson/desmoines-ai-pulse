-- WEB-LEGAL-006: record the billing interval so a trial-conversion notice can
-- state the real amount.
--
-- The notice has to say what the card will be charged and when. The amount
-- differs between Insider and VIP and between monthly and yearly, and while
-- subscription_plans carries both prices, nothing recorded WHICH one a given
-- subscription is on. It could not be inferred either: during a trial,
-- current_period_end equals trial_end, so the period span is the trial length
-- rather than the billing interval.
--
-- Additive and nullable, with no default, so no table rewrite and no reader
-- breaks. Existing rows stay NULL until Stripe next sends an event for them;
-- callers must treat NULL as "interval unknown" rather than assuming monthly.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval TEXT;

COMMENT ON COLUMN public.user_subscriptions.billing_interval IS
  'Stripe price recurring.interval ("month" or "year"). NULL when unknown, e.g. rows predating WEB-LEGAL-006 or in-app purchases. Used to state the exact renewal amount in the trial-conversion notice.';
