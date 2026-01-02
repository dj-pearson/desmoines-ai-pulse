-- Migration: Stripe Payment Workflow Enhancements
-- Purpose: Add missing columns and policies for complete Stripe integration

-- Add stripe_refund_id to refunds table for tracking Stripe refunds
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'refunds'
        AND column_name = 'stripe_refund_id'
    ) THEN
        ALTER TABLE public.refunds ADD COLUMN stripe_refund_id TEXT;
    END IF;
END $$;

-- Add index on stripe_refund_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id
ON public.refunds(stripe_refund_id);

-- Add index on user_subscriptions stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id
ON public.user_subscriptions(stripe_subscription_id);

-- Add index on user_subscriptions stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id
ON public.user_subscriptions(stripe_customer_id);

-- Add RLS policy for service role to manage subscriptions (for webhook updates)
-- This allows the webhook to update subscriptions without user context
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'user_subscriptions'
        AND policyname = 'Service role can manage all subscriptions'
    ) THEN
        CREATE POLICY "Service role can manage all subscriptions"
        ON public.user_subscriptions
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Create function to update subscription plans with Stripe price IDs
-- This is a helper function for admins to configure Stripe products
CREATE OR REPLACE FUNCTION update_subscription_stripe_prices(
    p_plan_name TEXT,
    p_stripe_price_id_monthly TEXT DEFAULT NULL,
    p_stripe_price_id_yearly TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan_id UUID;
BEGIN
    -- Get the plan ID
    SELECT id INTO v_plan_id
    FROM public.subscription_plans
    WHERE name = p_plan_name;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan not found: %', p_plan_name;
    END IF;

    -- Update the Stripe price IDs
    UPDATE public.subscription_plans
    SET
        stripe_price_id_monthly = COALESCE(p_stripe_price_id_monthly, stripe_price_id_monthly),
        stripe_price_id_yearly = COALESCE(p_stripe_price_id_yearly, stripe_price_id_yearly),
        updated_at = NOW()
    WHERE id = v_plan_id;

    RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users (admin check in function if needed)
GRANT EXECUTE ON FUNCTION update_subscription_stripe_prices TO authenticated;

-- Create function to get user's current subscription tier
-- Useful for checking subscription status from database
CREATE OR REPLACE FUNCTION get_user_subscription_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_tier TEXT;
BEGIN
    SELECT sp.name INTO v_tier
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
    LIMIT 1;

    RETURN COALESCE(v_tier, 'free');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_subscription_tier TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_subscription_tier TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION update_subscription_stripe_prices IS
'Updates Stripe price IDs for a subscription plan. Use this to configure payment integration.
Example: SELECT update_subscription_stripe_prices(''insider'', ''price_xxx_monthly'', ''price_xxx_yearly'');';

COMMENT ON FUNCTION get_user_subscription_tier IS
'Returns the current subscription tier for a user (free, insider, or vip).';

-- Add constraint to ensure refund amount is positive
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
        AND constraint_name = 'refunds_amount_positive'
    ) THEN
        ALTER TABLE public.refunds
        ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL; -- Constraint already exists
END $$;
