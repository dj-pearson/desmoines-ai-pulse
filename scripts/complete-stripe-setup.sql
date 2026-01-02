-- Complete Stripe Setup SQL
-- Run this in your Supabase SQL Editor to create tables and update Stripe price IDs
-- ==================================================================================

-- Newsletter Subscribers Table
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    first_name TEXT,
    source TEXT DEFAULT 'website', -- website, popup, footer, checkout
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
    preferences JSONB DEFAULT '{"weekly_digest": true, "event_alerts": true, "restaurant_updates": true, "promotions": true}'::jsonb,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,
    ip_address TEXT,
    user_agent TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consumer Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_yearly DECIMAL(10,2),
    stripe_price_id_monthly TEXT,
    stripe_price_id_yearly TEXT,
    features JSONB DEFAULT '[]'::jsonb,
    limits JSONB DEFAULT '{}'::jsonb, -- e.g., {"favorites": 5, "alerts": 3}
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'paused')),
    stripe_subscription_id TEXT,
    stripe_customer_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Referrals Table for viral growth
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_email TEXT NOT NULL,
    referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    referral_code TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'subscribed', 'rewarded')),
    reward_type TEXT, -- 'free_month', 'discount', 'xp_bonus'
    reward_claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    converted_at TIMESTAMPTZ
);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, display_name, description, price_monthly, price_yearly, features, limits, sort_order) VALUES
('free', 'Free', 'Perfect for casual explorers', 0, 0,
 '["Browse all events", "Basic search", "Save up to 5 favorites", "Weekly email digest"]'::jsonb,
 '{"favorites": 5, "alerts": 1, "saved_searches": 1}'::jsonb, 1),

('insider', 'Insider', 'For the passionate Des Moines explorer', 4.99, 49.99,
 '["Everything in Free", "Unlimited favorites", "Early access to events", "Advanced filters", "Daily personalized digest", "Ad-free experience", "Priority customer support"]'::jsonb,
 '{"favorites": -1, "alerts": 10, "saved_searches": 10}'::jsonb, 2),

('vip', 'VIP', 'The ultimate Des Moines experience', 12.99, 129.99,
 '["Everything in Insider", "Exclusive VIP events", "Restaurant reservation assistance", "Personalized recommendations", "SMS alerts for your interests", "Monthly local business perks", "Concierge support"]'::jsonb,
 '{"favorites": -1, "alerts": -1, "saved_searches": -1}'::jsonb, 3)
ON CONFLICT (name) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON public.newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON public.newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribed_at ON public.newsletter_subscribers(subscribed_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);

-- RLS Policies
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Newsletter: Allow insert from anyone (for signups), read only by admins
CREATE POLICY "Anyone can subscribe to newsletter" ON public.newsletter_subscribers
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can read newsletter subscribers" ON public.newsletter_subscribers
    FOR SELECT USING (
        user_has_role_or_higher(auth.uid(), 'admin'::user_role)
    );

-- Subscription plans: Public read
CREATE POLICY "Anyone can view subscription plans" ON public.subscription_plans
    FOR SELECT USING (is_active = true);

-- User subscriptions: Users can view their own
CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage subscriptions" ON public.user_subscriptions
    FOR ALL USING (
        user_has_role_or_higher(auth.uid(), 'admin'::user_role)
    );

-- Referrals: Users can view and create their own
CREATE POLICY "Users can view own referrals" ON public.referrals
    FOR SELECT USING (auth.uid() = referrer_id);

CREATE POLICY "Users can create referrals" ON public.referrals
    FOR INSERT WITH CHECK (auth.uid() = referrer_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_newsletter_subscribers_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER update_newsletter_subscribers_updated_at
    BEFORE UPDATE ON public.newsletter_subscribers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================================================================================
-- UPDATE STRIPE PRICE IDs (LIVE MODE)
-- ==================================================================================

-- Update Insider plan with LIVE Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = 'price_1Sk6oQCowC4ZHKLCePYTb1kP',
    stripe_price_id_yearly = 'price_1Sk6oRCowC4ZHKLCdlAh24AA',
    updated_at = NOW()
WHERE name = 'insider';

-- Update VIP plan with LIVE Stripe price IDs
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = 'price_1Sk6oSCowC4ZHKLCVwSadwu9',
    stripe_price_id_yearly = 'price_1Sk6oTCowC4ZHKLCT52IdwBe',
    updated_at = NOW()
WHERE name = 'vip';

-- Verify the setup
SELECT 
    name, 
    display_name, 
    price_monthly, 
    price_yearly,
    stripe_price_id_monthly, 
    stripe_price_id_yearly,
    is_active
FROM public.subscription_plans
ORDER BY sort_order;
