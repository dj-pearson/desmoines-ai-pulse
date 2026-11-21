-- WEB-ADS-018: a referral becomes 'subscribed' when the person it brought in
-- starts paying.
--
-- WHAT WAS MISSING. 20261006000002 writes a referrals row with status
-- 'signed_up' when a new account arrives on someone's ?ref link, and
-- get_my_referral_stats() already counts status IN ('subscribed','rewarded')
-- as `subscribed`. Nothing ever moved a row to 'subscribed', so that count is
-- 0 for every member forever, and the one number that says whether invites
-- bring in revenue (rather than free accounts) could not be read anywhere.
--
-- WHY A TRIGGER ON user_subscriptions AND NOT CODE IN stripe-webhook. Three
-- writers create paid rows: stripe-webhook (web), and the iOS and Android
-- receipt paths (platform 'ios' / 'android', 20260327000001). A trigger on the
-- table covers all three and any future one; a webhook change covers web only.
--
-- WHAT COUNTS AS SUBSCRIBED: status = 'active' on a plan that is not 'free'.
-- 'trialing' does not count. A trial has not paid anything, and the point of
-- this number is paid conversion; the row is flipped when the trial converts
-- and Stripe moves it to 'active'. The move is one-way: a referral that
-- subscribed and later cancelled still subscribed, and get_my_referral_stats
-- counts history, not current state.
--
-- IT MUST NEVER FAIL A SUBSCRIPTION WRITE. stripe-webhook throws on a failed
-- user_subscriptions write so Stripe redelivers; a bookkeeping error on
-- referrals bubbling up through this trigger would turn a paid checkout into a
-- retry loop. The UPDATE runs in its own exception block and only RAISEs a
-- WARNING.
--
-- ADDITIVE ONLY: one new function, one new trigger, and a backfill that moves
-- rows forward from 'signed_up' to 'subscribed' (a value the CHECK has allowed
-- since 20251126000000). No column, policy, RPC signature or return shape
-- changes, so no shipped iOS/Android binary is affected.

CREATE OR REPLACE FUNCTION public.mark_referral_subscribed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_plans sp
    WHERE sp.id = NEW.plan_id AND sp.name <> 'free'
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public.referrals
    SET status = 'subscribed'
    WHERE referred_user_id = NEW.user_id
      AND status = 'signed_up';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mark_referral_subscribed: user % not marked: % (%)',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_referral_subscribed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_subscriptions_mark_referral_subscribed ON public.user_subscriptions;
CREATE TRIGGER user_subscriptions_mark_referral_subscribed
  AFTER INSERT OR UPDATE OF status, plan_id ON public.user_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.mark_referral_subscribed();

-- Backfill: referred members who are already paying.
UPDATE public.referrals r
SET status = 'subscribed'
FROM public.user_subscriptions us
JOIN public.subscription_plans sp ON sp.id = us.plan_id
WHERE r.referred_user_id = us.user_id
  AND r.status = 'signed_up'
  AND us.status = 'active'
  AND sp.name <> 'free';
