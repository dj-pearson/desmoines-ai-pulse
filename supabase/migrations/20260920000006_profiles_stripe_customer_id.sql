-- WEB-ADS-014 AC6: remember the Stripe customer instead of looking it up by
-- email every time.
--
-- create-campaign-checkout calls stripe.customers.list({ email }) on every
-- checkout and uses the first result. Two problems, and the second is the
-- expensive one:
--
--   1. It is a network round trip to Stripe before anything else happens, on a
--      path a buyer is waiting on.
--   2. `email` is not a unique key in Stripe. A customer created by another
--      flow, or a duplicate created by an earlier race, can be the one that
--      comes back first - so a returning advertiser can be attached to a
--      DIFFERENT customer record than the one holding their payment history,
--      and a refund or a receipt then looks at the wrong one.
--
-- Storing the id on the profile makes the mapping ours and stable. The lookup
-- stays as the fallback for anyone who bought before this shipped.
--
-- ADDITIVE: one nullable text column, no default, nothing tightened. Older iOS
-- and Android binaries read profiles and ignore keys they do not know.
--
-- NOT UNIQUE, deliberately. A unique index here would turn a duplicate written
-- by a race into a 23505 on somebody's checkout - failing a payment to protect
-- a tidiness property. The writer below is a conditional UPDATE that only fills
-- a NULL, which is the part that actually needs to be safe.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS
  'The Stripe customer this person buys as (WEB-ADS-014). Written by create-campaign-checkout the first time they check out; email lookup is the fallback for accounts that predate it.';
