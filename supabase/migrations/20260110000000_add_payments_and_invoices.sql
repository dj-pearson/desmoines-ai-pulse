-- Migration: Add Payments and Invoices Tables
-- Purpose: Complete payment tracking system with invoice generation support

-- Create payment_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_type') THEN
        CREATE TYPE payment_type AS ENUM ('subscription', 'campaign', 'one_time');
    END IF;
END $$;

-- Create payment_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');
    END IF;
END $$;

-- Create invoice_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE invoice_status AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');
    END IF;
END $$;

-- =============================================================================
-- PAYMENTS TABLE
-- Tracks all payment transactions (subscriptions, campaigns, one-time)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Payment identifiers
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_charge_id TEXT,
    stripe_invoice_id TEXT,

    -- Payment details
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    payment_type payment_type NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',

    -- Related entities
    subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,

    -- Refund tracking
    refunded_amount NUMERIC(10, 2) DEFAULT 0 CHECK (refunded_amount >= 0),

    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_refund_amount CHECK (refunded_amount <= amount)
);

-- Create indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON public.payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_invoice_id ON public.payments(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON public.payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_campaign_id ON public.payments(campaign_id);

-- =============================================================================
-- INVOICES TABLE
-- Stores invoice records for PDF generation and history
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,

    -- Invoice identifiers
    invoice_number TEXT UNIQUE NOT NULL,
    stripe_invoice_id TEXT UNIQUE,

    -- Invoice details
    status invoice_status NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    tax NUMERIC(10, 2) DEFAULT 0 CHECK (tax >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    currency TEXT NOT NULL DEFAULT 'usd',

    -- Billing details
    customer_name TEXT,
    customer_email TEXT,
    billing_address JSONB,

    -- Invoice content
    line_items JSONB NOT NULL DEFAULT '[]',
    description TEXT,
    notes TEXT,

    -- PDF storage
    pdf_url TEXT,
    pdf_generated_at TIMESTAMPTZ,

    -- Dates
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    paid_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id ON public.invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON public.invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);

-- =============================================================================
-- BILLING HISTORY VIEW
-- Combines payments and invoices for easy querying
-- =============================================================================
CREATE OR REPLACE VIEW public.billing_history AS
SELECT
    p.id as payment_id,
    i.id as invoice_id,
    i.invoice_number,
    p.user_id,
    p.amount,
    p.currency,
    p.payment_type,
    p.status as payment_status,
    i.status as invoice_status,
    p.description,
    p.paid_at,
    p.refunded_amount,
    i.pdf_url,
    p.created_at,
    CASE
        WHEN p.subscription_id IS NOT NULL THEN 'subscription'
        WHEN p.campaign_id IS NOT NULL THEN 'campaign'
        ELSE 'other'
    END as source_type,
    p.subscription_id,
    p.campaign_id
FROM public.payments p
LEFT JOIN public.invoices i ON i.payment_id = p.id;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Payments policies
CREATE POLICY "Users can view own payments" ON public.payments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all payments" ON public.payments
    FOR ALL USING (true) WITH CHECK (true);

-- Invoices policies
CREATE POLICY "Users can view own invoices" ON public.invoices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all invoices" ON public.invoices
    FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year TEXT;
    v_sequence INTEGER;
    v_invoice_number TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;

    -- Get the next sequence number for this year
    SELECT COALESCE(MAX(
        CASE
            WHEN invoice_number ~ ('^INV-' || v_year || '-[0-9]+$')
            THEN SUBSTRING(invoice_number FROM '[0-9]+$')::INTEGER
            ELSE 0
        END
    ), 0) + 1
    INTO v_sequence
    FROM public.invoices
    WHERE invoice_number LIKE 'INV-' || v_year || '-%';

    -- Format: INV-2026-00001
    v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');

    RETURN v_invoice_number;
END;
$$;

-- Function to get user payment summary
CREATE OR REPLACE FUNCTION get_user_payment_summary(p_user_id UUID)
RETURNS TABLE (
    total_spent NUMERIC,
    payment_count INTEGER,
    subscription_payments NUMERIC,
    campaign_payments NUMERIC,
    last_payment_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(p.amount), 0)::NUMERIC as total_spent,
        COUNT(*)::INTEGER as payment_count,
        COALESCE(SUM(CASE WHEN p.payment_type = 'subscription' THEN p.amount ELSE 0 END), 0)::NUMERIC as subscription_payments,
        COALESCE(SUM(CASE WHEN p.payment_type = 'campaign' THEN p.amount ELSE 0 END), 0)::NUMERIC as campaign_payments,
        MAX(p.paid_at) as last_payment_date
    FROM public.payments p
    WHERE p.user_id = p_user_id
    AND p.status = 'succeeded';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_invoice_number TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_payment_summary TO authenticated;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at for payments
CREATE OR REPLACE FUNCTION update_payment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_updated_at();

-- Auto-update updated_at for invoices
DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_updated_at();

-- =============================================================================
-- ADD canceled_at TO user_subscriptions IF MISSING
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'user_subscriptions'
        AND column_name = 'canceled_at'
    ) THEN
        ALTER TABLE public.user_subscriptions ADD COLUMN canceled_at TIMESTAMPTZ;
    END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE public.payments IS 'Tracks all payment transactions including subscriptions and campaigns';
COMMENT ON TABLE public.invoices IS 'Stores invoice records for PDF generation and billing history';
COMMENT ON VIEW public.billing_history IS 'Combined view of payments and invoices for easy billing history queries';
COMMENT ON FUNCTION generate_invoice_number IS 'Generates unique invoice numbers in format INV-YYYY-NNNNN';
COMMENT ON FUNCTION get_user_payment_summary IS 'Returns payment summary statistics for a user';
