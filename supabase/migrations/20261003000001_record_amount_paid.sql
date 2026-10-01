-- NON_CORE_REVIEW_2026-09 WP6 item 3: record what was actually paid.
--
-- Both checkouts allow Stripe promotion codes (allow_promotion_codes: true),
-- and nothing kept the result. campaigns.total_cost is the LIST price from the
-- rate card, so after a discount it overstates revenue, and process-stripe-
-- refund capped refunds at it. user_subscriptions had no amount at all.
--
-- stripe-webhook fills these from the Checkout Session on
-- checkout.session.completed:
--   amount_paid_cents      session.amount_total
--   amount_discount_cents  session.total_details.amount_discount
--   promotion_code         the code the customer typed, when one was used
--
-- Cents, as Stripe reports them, so nothing is rounded twice. The webhook
-- writes them in a separate best-effort UPDATE after the status change, so a
-- deploy that lands before this migration logs a 42703/PGRST204 and carries
-- on; it never blocks a payment from being recorded.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): nullable columns with no default. No
-- existing reader or writer changes shape. Rows paid before this ship stay
-- NULL, which reads as "not recorded", not as zero.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer,
  ADD COLUMN IF NOT EXISTS amount_discount_cents integer,
  ADD COLUMN IF NOT EXISTS promotion_code text;

COMMENT ON COLUMN public.campaigns.amount_paid_cents IS
  'What Stripe charged, in cents, after any promotion code (checkout.session.completed amount_total). NULL = paid before this was recorded, or not paid. total_cost is the list price.';
COMMENT ON COLUMN public.campaigns.amount_discount_cents IS
  'Discount Stripe applied at checkout, in cents (total_details.amount_discount).';
COMMENT ON COLUMN public.campaigns.promotion_code IS
  'The promotion code used at checkout, as the customer typed it, or its Stripe id when the code could not be read.';

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer,
  ADD COLUMN IF NOT EXISTS amount_discount_cents integer,
  ADD COLUMN IF NOT EXISTS promotion_code text;

COMMENT ON COLUMN public.user_subscriptions.amount_paid_cents IS
  'First checkout charge in cents (0 during a trial). Web/Stripe rows only; renewals are in Stripe.';
COMMENT ON COLUMN public.user_subscriptions.amount_discount_cents IS
  'Discount applied at the first checkout, in cents.';
COMMENT ON COLUMN public.user_subscriptions.promotion_code IS
  'The promotion code used at checkout, if any.';
