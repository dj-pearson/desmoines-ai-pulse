-- Event Promotion Planner Database Schema
-- Creates tables for email captures, referrals, and analytics

-- Email captures table
CREATE TABLE IF NOT EXISTS event_promotion_email_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    event_name VARCHAR(255),
    organization_name VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    event_date DATE NOT NULL,
    send_reminders BOOLEAN DEFAULT true,
    referral_code VARCHAR(50),
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_epp_email ON event_promotion_email_captures(email);
CREATE INDEX IF NOT EXISTS idx_epp_created_at ON event_promotion_email_captures(created_at);

-- Referrals table
CREATE TABLE IF NOT EXISTS event_promotion_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    referrer_email VARCHAR(255) NOT NULL,
    referred_email VARCHAR(255),
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    reward_claimed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on referral code
CREATE INDEX IF NOT EXISTS idx_epp_referral_code ON event_promotion_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_epp_referrer_email ON event_promotion_referrals(referrer_email);

-- Analytics events table
CREATE TABLE IF NOT EXISTS event_promotion_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    session_id VARCHAR(100),
    user_email VARCHAR(255),
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for analytics
CREATE INDEX IF NOT EXISTS idx_epp_analytics_event_type ON event_promotion_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_epp_analytics_created_at ON event_promotion_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_epp_analytics_session ON event_promotion_analytics(session_id);

-- Timeline tasks completed tracking
CREATE TABLE IF NOT EXISTS event_promotion_task_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    task_id VARCHAR(100) NOT NULL,
    completed BOOLEAN DEFAULT true,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for task lookups
CREATE INDEX IF NOT EXISTS idx_epp_task_email ON event_promotion_task_completions(email);
CREATE INDEX IF NOT EXISTS idx_epp_task_id ON event_promotion_task_completions(task_id);

-- Email sequence status tracking
CREATE TABLE IF NOT EXISTS event_promotion_email_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    sequence_day INTEGER NOT NULL,
    email_type VARCHAR(100) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_epp_sequence_email ON event_promotion_email_sequences(email);
CREATE INDEX IF NOT EXISTS idx_epp_sequence_status ON event_promotion_email_sequences(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Helper function to get current user email from JWT
CREATE OR REPLACE FUNCTION current_user_email()
RETURNS TEXT AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claims', true)::json->>'email',
        ''
    );
$$ LANGUAGE SQL STABLE;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (current_setting('request.jwt.claims', true)::json->>'role') = 'admin',
        false
    );
$$ LANGUAGE SQL STABLE;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_event_promotion_email_captures_updated_at ON event_promotion_email_captures;
CREATE TRIGGER update_event_promotion_email_captures_updated_at
    BEFORE UPDATE ON event_promotion_email_captures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE event_promotion_email_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_promotion_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_promotion_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_promotion_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_promotion_email_sequences ENABLE ROW LEVEL SECURITY;

-- Allow public to insert email captures
DROP POLICY IF EXISTS "Anyone can insert email captures" ON event_promotion_email_captures;
CREATE POLICY "Anyone can insert email captures" ON event_promotion_email_captures
    FOR INSERT WITH CHECK (true);

-- Allow users to view their own data
DROP POLICY IF EXISTS "Users can view own email captures" ON event_promotion_email_captures;
CREATE POLICY "Users can view own email captures" ON event_promotion_email_captures
    FOR SELECT USING (email = current_user_email());

-- Allow public to insert referrals
DROP POLICY IF EXISTS "Anyone can insert referrals" ON event_promotion_referrals;
CREATE POLICY "Anyone can insert referrals" ON event_promotion_referrals
    FOR INSERT WITH CHECK (true);

-- Allow public to insert analytics
DROP POLICY IF EXISTS "Anyone can insert analytics" ON event_promotion_analytics;
CREATE POLICY "Anyone can insert analytics" ON event_promotion_analytics
    FOR INSERT WITH CHECK (true);

-- Allow admins to view all data
DROP POLICY IF EXISTS "Admins can view all email captures" ON event_promotion_email_captures;
CREATE POLICY "Admins can view all email captures" ON event_promotion_email_captures
    FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Admins can view all referrals" ON event_promotion_referrals;
CREATE POLICY "Admins can view all referrals" ON event_promotion_referrals
    FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Admins can view all analytics" ON event_promotion_analytics;
CREATE POLICY "Admins can view all analytics" ON event_promotion_analytics
    FOR ALL USING (is_admin());

-- Materialized view for analytics dashboard (refresh daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS event_promotion_analytics_summary AS
SELECT
    DATE(created_at) as date,
    event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(DISTINCT user_email) as unique_users
FROM event_promotion_analytics
GROUP BY DATE(created_at), event_type
ORDER BY date DESC, event_count DESC;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_epp_analytics_summary_date ON event_promotion_analytics_summary(date);

-- Refresh materialized view daily
CREATE OR REPLACE FUNCTION refresh_event_promotion_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY event_promotion_analytics_summary;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE event_promotion_email_captures IS 'Stores email captures from the Event Promotion Planner tool';
COMMENT ON TABLE event_promotion_referrals IS 'Tracks referral codes and their usage';
COMMENT ON TABLE event_promotion_analytics IS 'Stores all user interactions and events';
COMMENT ON TABLE event_promotion_task_completions IS 'Tracks which tasks users have completed';
COMMENT ON TABLE event_promotion_email_sequences IS 'Manages the 7-day email nurture sequence';
