-- Migration: Add Usage Tracking for Metered Billing
-- Purpose: Track usage events for usage-based billing scenarios

-- Create usage_event_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usage_event_type') THEN
        CREATE TYPE usage_event_type AS ENUM (
            'api_call',
            'ai_generation',
            'email_sent',
            'sms_sent',
            'report_generated',
            'export_created',
            'custom'
        );
    END IF;
END $$;

-- =============================================================================
-- USAGE EVENTS TABLE
-- Tracks individual usage events for metered billing
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,

    -- Event details
    event_type usage_event_type NOT NULL,
    event_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10, 4) DEFAULT 0,

    -- Context
    metadata JSONB DEFAULT '{}',
    idempotency_key TEXT,

    -- Billing
    billed BOOLEAN DEFAULT FALSE,
    billed_at TIMESTAMPTZ,
    billing_period_start DATE,
    billing_period_end DATE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate events
    UNIQUE(idempotency_key)
);

-- Create indexes for usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON public.usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_subscription_id ON public.usage_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON public.usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON public.usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_billed ON public.usage_events(billed) WHERE billed = FALSE;
CREATE INDEX IF NOT EXISTS idx_usage_events_billing_period ON public.usage_events(billing_period_start, billing_period_end);

-- =============================================================================
-- USAGE QUOTAS TABLE
-- Defines usage limits per subscription tier
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.usage_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE CASCADE,

    -- Quota details
    event_type usage_event_type NOT NULL,
    monthly_limit INTEGER, -- NULL means unlimited
    overage_rate NUMERIC(10, 4) DEFAULT 0, -- Cost per unit over limit
    included_units INTEGER DEFAULT 0, -- Units included in subscription

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(plan_id, event_type)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_usage_quotas_plan_id ON public.usage_quotas(plan_id);

-- =============================================================================
-- USAGE SUMMARY VIEW
-- Aggregated usage per user per billing period
-- =============================================================================
CREATE OR REPLACE VIEW public.usage_summary AS
SELECT
    ue.user_id,
    ue.subscription_id,
    ue.event_type,
    ue.billing_period_start,
    ue.billing_period_end,
    SUM(ue.quantity) as total_quantity,
    SUM(ue.quantity * ue.unit_price) as total_cost,
    COUNT(*) as event_count,
    MAX(ue.created_at) as last_event_at
FROM public.usage_events ue
GROUP BY
    ue.user_id,
    ue.subscription_id,
    ue.event_type,
    ue.billing_period_start,
    ue.billing_period_end;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;

-- Usage events policies
CREATE POLICY "Users can view own usage events" ON public.usage_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all usage events" ON public.usage_events
    FOR ALL USING (true) WITH CHECK (true);

-- Usage quotas policies (read-only for users)
CREATE POLICY "Anyone can view usage quotas" ON public.usage_quotas
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage usage quotas" ON public.usage_quotas
    FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to record a usage event
CREATE OR REPLACE FUNCTION record_usage_event(
    p_user_id UUID,
    p_event_type usage_event_type,
    p_event_name TEXT,
    p_quantity INTEGER DEFAULT 1,
    p_metadata JSONB DEFAULT '{}',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id UUID;
    v_subscription_id UUID;
    v_billing_start DATE;
    v_billing_end DATE;
    v_unit_price NUMERIC;
BEGIN
    -- Get user's active subscription
    SELECT us.id, us.current_period_start::DATE, us.current_period_end::DATE
    INTO v_subscription_id, v_billing_start, v_billing_end
    FROM public.user_subscriptions us
    WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
    LIMIT 1;

    -- Get unit price from quota (if overage applies)
    SELECT uq.overage_rate INTO v_unit_price
    FROM public.usage_quotas uq
    JOIN public.user_subscriptions us ON uq.plan_id = us.plan_id
    WHERE us.id = v_subscription_id
    AND uq.event_type = p_event_type;

    -- Insert usage event
    INSERT INTO public.usage_events (
        user_id,
        subscription_id,
        event_type,
        event_name,
        quantity,
        unit_price,
        metadata,
        idempotency_key,
        billing_period_start,
        billing_period_end
    )
    VALUES (
        p_user_id,
        v_subscription_id,
        p_event_type,
        p_event_name,
        p_quantity,
        COALESCE(v_unit_price, 0),
        p_metadata,
        p_idempotency_key,
        v_billing_start,
        v_billing_end
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- Function to get usage for current billing period
CREATE OR REPLACE FUNCTION get_current_usage(p_user_id UUID)
RETURNS TABLE (
    event_type usage_event_type,
    total_quantity BIGINT,
    monthly_limit INTEGER,
    included_units INTEGER,
    overage_quantity BIGINT,
    overage_cost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH current_subscription AS (
        SELECT
            us.id as subscription_id,
            us.plan_id,
            us.current_period_start::DATE as period_start,
            us.current_period_end::DATE as period_end
        FROM public.user_subscriptions us
        WHERE us.user_id = p_user_id
        AND us.status IN ('active', 'trialing')
        LIMIT 1
    ),
    usage_totals AS (
        SELECT
            ue.event_type,
            SUM(ue.quantity) as total_qty
        FROM public.usage_events ue
        JOIN current_subscription cs ON ue.subscription_id = cs.subscription_id
        WHERE ue.billing_period_start = cs.period_start
        AND ue.billing_period_end = cs.period_end
        GROUP BY ue.event_type
    )
    SELECT
        uq.event_type,
        COALESCE(ut.total_qty, 0) as total_quantity,
        uq.monthly_limit,
        uq.included_units,
        GREATEST(0, COALESCE(ut.total_qty, 0) - COALESCE(uq.included_units, 0)) as overage_quantity,
        GREATEST(0, COALESCE(ut.total_qty, 0) - COALESCE(uq.included_units, 0)) * uq.overage_rate as overage_cost
    FROM public.usage_quotas uq
    JOIN current_subscription cs ON uq.plan_id = cs.plan_id
    LEFT JOIN usage_totals ut ON ut.event_type = uq.event_type;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_usage_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_usage TO authenticated;

-- =============================================================================
-- SEED DEFAULT USAGE QUOTAS
-- =============================================================================

-- Insert default quotas for existing plans (if not already present)
INSERT INTO public.usage_quotas (plan_id, event_type, monthly_limit, overage_rate, included_units)
SELECT
    sp.id,
    'ai_generation'::usage_event_type,
    CASE
        WHEN sp.name = 'free' THEN 5
        WHEN sp.name = 'insider' THEN 50
        WHEN sp.name = 'vip' THEN NULL -- Unlimited
    END,
    0.10, -- $0.10 per generation over limit
    CASE
        WHEN sp.name = 'free' THEN 5
        WHEN sp.name = 'insider' THEN 50
        WHEN sp.name = 'vip' THEN 1000
    END
FROM public.subscription_plans sp
WHERE NOT EXISTS (
    SELECT 1 FROM public.usage_quotas uq
    WHERE uq.plan_id = sp.id AND uq.event_type = 'ai_generation'
)
ON CONFLICT DO NOTHING;

-- Insert email quotas
INSERT INTO public.usage_quotas (plan_id, event_type, monthly_limit, overage_rate, included_units)
SELECT
    sp.id,
    'email_sent'::usage_event_type,
    CASE
        WHEN sp.name = 'free' THEN 10
        WHEN sp.name = 'insider' THEN 100
        WHEN sp.name = 'vip' THEN NULL -- Unlimited
    END,
    0.01, -- $0.01 per email over limit
    CASE
        WHEN sp.name = 'free' THEN 10
        WHEN sp.name = 'insider' THEN 100
        WHEN sp.name = 'vip' THEN 1000
    END
FROM public.subscription_plans sp
WHERE NOT EXISTS (
    SELECT 1 FROM public.usage_quotas uq
    WHERE uq.plan_id = sp.id AND uq.event_type = 'email_sent'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at for usage_quotas
DROP TRIGGER IF EXISTS usage_quotas_updated_at ON public.usage_quotas;
CREATE TRIGGER usage_quotas_updated_at
    BEFORE UPDATE ON public.usage_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE public.usage_events IS 'Tracks individual usage events for metered/usage-based billing';
COMMENT ON TABLE public.usage_quotas IS 'Defines usage limits and overage rates per subscription tier';
COMMENT ON VIEW public.usage_summary IS 'Aggregated usage statistics per user per billing period';
COMMENT ON FUNCTION record_usage_event IS 'Records a usage event with idempotency support';
COMMENT ON FUNCTION get_current_usage IS 'Returns current period usage with quota information';
