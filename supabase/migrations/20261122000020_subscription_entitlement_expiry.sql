-- WEB-BE-062 -- entitlement ends on time, and a nightly job asks Stripe.
--
-- Before this, 'active' and 'trialing' granted entitlement with no time bound
-- in all three copies of the rule (_shared/entitlements.ts,
-- src/hooks/useSubscription.ts and entitled_plan_limit() below). The only
-- thing that moved a web row off 'active' was a Stripe webhook reaching
-- stripe-webhook, and Stripe stops retrying after three days. One missed
-- customer.subscription.deleted meant free premium for good, and nothing ever
-- compared a row with the provider.
--
-- 1. public.subscription_row_entitled(status, current_period_end, now): the one
--    SQL predicate. active/trialing are entitled until current_period_end +
--    3 days, past_due until current_period_end + 14 days, anything else never.
--    A NULL current_period_end is not entitled (every writer sets it from the
--    provider). entitled_plan_limit() and get_user_subscription_tier() now
--    call it instead of carrying their own copy.
-- 2. subscription_reconcile_checks + four service_role-only RPCs used by the
--    subscription-reconcile edge function: which rows to re-check, what to
--    write when Stripe answers, and how many paid-status rows are past their
--    period end per platform.
-- 3. The daily schedule, with credentials from Vault via public.app_secret().
--
-- BACKWARD COMPATIBILITY. Additive for every client. No column of
-- user_subscriptions, profiles or subscription_plans changes; the apps read
-- the same rows. entitled_plan_limit() and get_user_subscription_tier() keep
-- their signatures and return types. What changes is the answer for a row
-- whose paid period ended more than three days ago and still says 'active':
-- that is the bug. get_user_subscription_tier() also starts honouring the
-- 14-day past_due grace window the other copies already had, which only
-- grants. No shipped binary calls it (grep ios/ android/ src/).
--
-- THE RECONCILER NEVER EXTENDS ENTITLEMENT ON AN ERROR. It writes only what
-- Stripe actually returned for that subscription id. A Stripe error, a 404, or
-- an answer it cannot read writes nothing to user_subscriptions; it is
-- recorded in subscription_reconcile_checks and counted in the run. Because
-- the predicate above already ends entitlement three days after the period,
-- "write nothing" fails closed on time without the job having to guess that a
-- subscription was cancelled.

-- ---------------------------------------------------------------------------
-- 1. The predicate
-- ---------------------------------------------------------------------------
-- STABLE, not IMMUTABLE: timestamptz + interval 'N days' depends on the
-- session TimeZone across a DST change. SQL so it inlines into callers.
CREATE OR REPLACE FUNCTION public.subscription_row_entitled(
  p_status text,
  p_current_period_end timestamptz,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    p_current_period_end IS NOT NULL
    AND CASE
      WHEN p_status IN ('active', 'trialing')
        THEN p_now <= p_current_period_end + interval '3 days'
      WHEN p_status = 'past_due'
        THEN p_now <= p_current_period_end + interval '14 days'
      ELSE false
    END,
    false
  );
$$;

COMMENT ON FUNCTION public.subscription_row_entitled(text, timestamptz, timestamptz) IS
  'WEB-BE-062: whether one user_subscriptions row grants entitlement now. active/trialing until current_period_end + 3 days, past_due until + 14 days, else never; NULL period end never. Mirrors isSubscriptionRowEntitled in _shared/entitlements.ts and isSubscriptionEntitled in src/hooks/useSubscription.ts.';

-- ---------------------------------------------------------------------------
-- entitled_plan_limit: same body as 20260918000001, predicate swapped in
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entitled_plan_limit(p_user_id uuid, p_limit_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH entitled AS (
    SELECT (sp.limits ->> p_limit_key)::integer AS lim
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id
      AND sp.limits ? p_limit_key
      AND public.subscription_row_entitled(us.status, us.current_period_end)
  )
  SELECT COALESCE(
    -- -1 is unlimited, so it has to beat any finite number rather than lose to
    -- max(). A user holding web=insider (favorites -1) and ios=free must get -1.
    (SELECT CASE WHEN bool_or(lim = -1) THEN -1 ELSE max(lim) END
       FROM entitled WHERE lim IS NOT NULL),
    (SELECT (limits ->> p_limit_key)::integer
       FROM public.subscription_plans WHERE name = 'free' LIMIT 1),
    0
  );
$$;

COMMENT ON FUNCTION public.entitled_plan_limit(uuid, text) IS
  'WEB-FEAT-017 / WEB-BE-062: highest plan limit the user is entitled to for a limits key; -1 = unlimited. Entitlement is public.subscription_row_entitled().';

REVOKE ALL ON FUNCTION public.entitled_plan_limit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entitled_plan_limit(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_user_subscription_tier: same body as 20260927000001, predicate swapped in
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_subscription_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tier TEXT;
BEGIN
    IF p_user_id IS DISTINCT FROM auth.uid()
       AND COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.is_admin_or_root() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT sp.name INTO v_tier
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
      AND public.subscription_row_entitled(us.status, us.current_period_end)
    ORDER BY sp.sort_order DESC
    LIMIT 1;

    RETURN COALESCE(v_tier, 'free');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_subscription_tier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_tier(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Reconciliation state
-- ---------------------------------------------------------------------------
-- One row per subscription the job has looked at, so a row Stripe cannot
-- answer for (or an iOS/Android row the job cannot check yet) moves to the
-- back of the queue instead of filling every batch.
CREATE TABLE IF NOT EXISTS public.subscription_reconcile_checks (
  subscription_id uuid PRIMARY KEY REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  outcome         text NOT NULL,
  detail          text
);

ALTER TABLE public.subscription_reconcile_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_reconcile_checks_admin_select" ON public.subscription_reconcile_checks;
CREATE POLICY "subscription_reconcile_checks_admin_select"
  ON public.subscription_reconcile_checks FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.subscription_reconcile_checks IS
  'WEB-BE-062: last subscription-reconcile outcome per user_subscriptions row (corrected, unchanged, not_found, unreadable, provider_error, no_provider_reference, provider_not_wired).';

-- Rows whose status says paid and whose period has ended (or was never set),
-- not checked in the last 20 hours, least recently checked first and then the
-- most recently lapsed: a renewal the webhook missed is a paying member who
-- is about to lose access, so it goes first.
CREATE OR REPLACE FUNCTION public.subscription_reconcile_candidates(
  p_limit integer DEFAULT 50,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  platform text,
  status text,
  current_period_end timestamptz,
  stripe_subscription_id text,
  plan_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT us.id, us.user_id, us.platform, us.status, us.current_period_end,
         us.stripe_subscription_id, us.plan_id
  FROM public.user_subscriptions us
  LEFT JOIN public.subscription_reconcile_checks c ON c.subscription_id = us.id
  WHERE us.status IN ('active', 'trialing', 'past_due')
    AND (us.current_period_end IS NULL OR us.current_period_end < p_now)
    AND (c.checked_at IS NULL OR c.checked_at < p_now - interval '20 hours')
  ORDER BY c.checked_at ASC NULLS FIRST, us.current_period_end DESC NULLS FIRST, us.id
  LIMIT greatest(1, least(COALESCE(p_limit, 50), 200));
$$;

-- Paid-status rows past their period end, per platform, whatever their check
-- state. The run reports this beside what it did, so a backlog the batch
-- cannot reach is visible rather than read as "nothing to do".
CREATE OR REPLACE FUNCTION public.subscription_reconcile_backlog(p_now timestamptz DEFAULT now())
RETURNS TABLE (platform text, lapsed bigint, not_entitled bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT us.platform,
         count(*) AS lapsed,
         count(*) FILTER (
           WHERE NOT public.subscription_row_entitled(us.status, us.current_period_end, p_now)
         ) AS not_entitled
  FROM public.user_subscriptions us
  WHERE us.status IN ('active', 'trialing', 'past_due')
    AND (us.current_period_end IS NULL OR us.current_period_end < p_now)
  GROUP BY us.platform
  ORDER BY us.platform;
$$;

-- Write what Stripe returned, and its subscription_events row, in one
-- transaction. p_patch is subscriptionUpdatePatch() from
-- _shared/stripeSubscriptionRow.ts, the same patch stripe-webhook writes on
-- customer.subscription.updated; a key absent from it leaves the column alone.
-- Scoped to the web row holding that Stripe subscription id, so a row that was
-- re-pointed since the candidate read is left alone and reported (false).
CREATE OR REPLACE FUNCTION public.apply_subscription_reconciliation(
  p_subscription_id uuid,
  p_stripe_subscription_id text,
  p_patch jsonb,
  p_details jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_platform text;
  v_status text := p_patch ->> 'status';
BEGIN
  IF v_status IS NULL
     OR v_status NOT IN ('active', 'trialing', 'past_due', 'canceled', 'paused') THEN
    RAISE EXCEPTION 'apply_subscription_reconciliation: unusable status %', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_subscriptions us SET
    status = v_status,
    current_period_start = CASE WHEN p_patch ? 'current_period_start'
      THEN (p_patch ->> 'current_period_start')::timestamptz ELSE us.current_period_start END,
    current_period_end = CASE WHEN p_patch ? 'current_period_end'
      THEN (p_patch ->> 'current_period_end')::timestamptz ELSE us.current_period_end END,
    cancel_at_period_end = CASE WHEN p_patch ? 'cancel_at_period_end'
      THEN (p_patch ->> 'cancel_at_period_end')::boolean ELSE us.cancel_at_period_end END,
    canceled_at = CASE WHEN p_patch ? 'canceled_at'
      THEN (p_patch ->> 'canceled_at')::timestamptz ELSE us.canceled_at END,
    trial_end = CASE WHEN p_patch ? 'trial_end'
      THEN (p_patch ->> 'trial_end')::timestamptz ELSE us.trial_end END,
    billing_interval = CASE WHEN p_patch ? 'billing_interval'
      THEN p_patch ->> 'billing_interval' ELSE us.billing_interval END,
    plan_id = CASE WHEN p_patch ->> 'plan_id' IS NOT NULL
      THEN (p_patch ->> 'plan_id')::uuid ELSE us.plan_id END,
    updated_at = now()
  WHERE us.id = p_subscription_id
    AND us.platform = 'web'
    AND us.stripe_subscription_id = p_stripe_subscription_id
  RETURNING us.user_id, us.platform INTO v_user, v_platform;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.subscription_events (user_id, subscription_id, event_type, platform, details)
  VALUES (v_user, p_subscription_id, 'reconciled', v_platform, p_details);

  INSERT INTO public.subscription_reconcile_checks (subscription_id, checked_at, outcome, detail)
  VALUES (p_subscription_id, now(), 'corrected', NULL)
  ON CONFLICT (subscription_id) DO UPDATE
    SET checked_at = EXCLUDED.checked_at, outcome = EXCLUDED.outcome, detail = EXCLUDED.detail;

  RETURN true;
END;
$$;

-- Every other outcome: the row is not touched, only its place in the queue.
CREATE OR REPLACE FUNCTION public.note_subscription_reconcile_check(
  p_subscription_id uuid,
  p_outcome text,
  p_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.subscription_reconcile_checks (subscription_id, checked_at, outcome, detail)
  VALUES (p_subscription_id, now(), p_outcome, left(p_detail, 500))
  ON CONFLICT (subscription_id) DO UPDATE
    SET checked_at = EXCLUDED.checked_at, outcome = EXCLUDED.outcome, detail = EXCLUDED.detail;
$$;

REVOKE ALL ON FUNCTION public.subscription_reconcile_candidates(integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscription_reconcile_backlog(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_subscription_reconciliation(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.note_subscription_reconcile_check(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_reconcile_candidates(integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.subscription_reconcile_backlog(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_subscription_reconciliation(uuid, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.note_subscription_reconcile_check(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Schedule: daily 10:23 UTC (04:23 Central), after subscription-lifecycle
-- ---------------------------------------------------------------------------
-- Credentials from Vault via public.app_secret(), as 20261108000103 does; the
-- function uses requireAdminOrApiKey, which accepts the service-role key.
-- batchSize 50 is one Stripe read per row, far inside Stripe's rate limit.
-- Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping subscription-reconcile schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-reconcile') THEN
    PERFORM cron.unschedule('subscription-reconcile');
  END IF;

  PERFORM cron.schedule(
    'subscription-reconcile',
    '23 10 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'subscription-reconcile not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/subscription-reconcile',
        body    := jsonb_build_object('batchSize', 50),
        headers := jsonb_build_object(
                     'Authorization', 'Bearer ' || v_key,
                     'Content-Type', 'application/json',
                     'x-trigger-source', 'cron'
                   ),
        timeout_milliseconds := 150000
      );
    END
    $inner$;
    $cron$
  );
END
$$;
