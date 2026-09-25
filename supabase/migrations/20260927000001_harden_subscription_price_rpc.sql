-- Pricing plan WP5 item 10 (applying it is deferred D5): harden the two
-- subscription RPCs that 20251225000000 created wide open.
--
-- update_subscription_stripe_prices is SECURITY DEFINER, was granted to
-- `authenticated`, and checked nothing, so any signed-in user could repoint
-- VIP's Stripe price at a cheaper one. It is not in production today (that
-- migration is in .github/migration-drift-baseline.json and the function is
-- absent from scripts/db-snapshot.json), but `supabase db reset` or any fresh
-- environment creates it exactly as written.
--
-- get_user_subscription_tier was granted to anon and authenticated and took
-- any user id, so it answered "what does this person pay for" about anyone.
-- It also returned an arbitrary row (LIMIT 1 with no ORDER BY) for a member
-- holding two plans across platforms.
--
-- SIGNATURES ARE UNCHANGED. Same names, same parameters, same defaults, same
-- return types, so CREATE OR REPLACE is enough and nothing is removed. grep
-- finds no caller of either in src/, scripts/, ios/, android/ or
-- supabase/functions/.
--
-- WHO MAY CALL update_subscription_stripe_prices. EXECUTE goes to service_role
-- only. The body additionally refuses any JWT that is neither service_role nor
-- an admin, so a later stray GRANT cannot reopen it. A session with no JWT at
-- all (the SQL editor, psql as the owner, a migration) has no role claim and
-- is let through: it could update subscription_plans directly anyway.

CREATE OR REPLACE FUNCTION public.update_subscription_stripe_prices(
    p_plan_name TEXT,
    p_stripe_price_id_monthly TEXT DEFAULT NULL,
    p_stripe_price_id_yearly TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plan_id UUID;
BEGIN
    IF NOT (
        public.is_admin_or_root()
        OR COALESCE(auth.role(), 'service_role') = 'service_role'
    ) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_plan_id
    FROM public.subscription_plans
    WHERE name = p_plan_name;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan not found: %', p_plan_name;
    END IF;

    UPDATE public.subscription_plans
    SET
        stripe_price_id_monthly = COALESCE(p_stripe_price_id_monthly, stripe_price_id_monthly),
        stripe_price_id_yearly = COALESCE(p_stripe_price_id_yearly, stripe_price_id_yearly),
        updated_at = NOW()
    WHERE id = v_plan_id;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_subscription_stripe_prices(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_subscription_stripe_prices(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.update_subscription_stripe_prices(TEXT, TEXT, TEXT) IS
'Updates Stripe price IDs for a subscription plan. service_role only; refuses any other JWT that is not an admin (42501).
Example: SELECT update_subscription_stripe_prices(''insider'', ''price_xxx_monthly'', ''price_xxx_yearly'');';

-- The caller's own tier. An admin or service_role may ask about anyone; any
-- other caller only about themselves. The highest plan wins, matching
-- manage-subscription's "details" and the apps.
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
      AND us.status IN ('active', 'trialing')
    ORDER BY sp.sort_order DESC
    LIMIT 1;

    RETURN COALESCE(v_tier, 'free');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_subscription_tier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_tier(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_user_subscription_tier(UUID) IS
'Returns the caller''s current subscription tier (free, insider, or vip), highest plan first. Another user''s tier only for admins and service_role (42501 otherwise).';
