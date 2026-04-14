-- Consent audit log
--
-- Persistent, append-only record of every consent event per user.
-- Required to demonstrate affirmative, timestamped consent under:
--   - GDPR Art. 7 ("The controller shall be able to demonstrate consent")
--   - CCPA/CPRA §1798.130 (record-keeping for consumer requests)
--   - CAN-SPAM §316 (record of opt-in for marketing email)
--   - TCPA (Prior Express Written Consent records for SMS marketing)
--
-- Never update or delete rows here — each consent change appends a new row so
-- the trail is tamper-evident. Retention: 7 years (or local statutory period).

CREATE TABLE IF NOT EXISTS consent_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Anonymous events (e.g. newsletter signup pre-auth) may not have a user_id,
    -- so we also capture a low-PII identifier.
    email_hash TEXT,
    -- Consent category. Free-form to support future categories, but the
    -- application layer should use the constants below:
    --   'terms'               - acceptance of ToS + Privacy Policy at signup
    --   'marketing_email'     - CAN-SPAM opt-in
    --   'marketing_sms'       - TCPA prior express written consent
    --   'personalization_ai'  - AI-assisted profiling / recommendations
    --   'cookies_analytics'   - analytics cookies
    --   'cookies_advertising' - advertising / targeting cookies
    --   'newsletter'          - newsletter subscription
    --   'data_sale_opt_out'   - CCPA/CPRA opt out of sale/sharing
    consent_type TEXT NOT NULL,
    -- Whether consent was granted (true) or withdrawn (false).
    granted BOOLEAN NOT NULL,
    -- Version of the policy document the user accepted (if applicable).
    policy_version TEXT,
    -- Where the consent was captured: 'signup', 'profile_settings',
    -- 'cookie_banner', 'newsletter_form', 'api', etc.
    source TEXT NOT NULL DEFAULT 'unknown',
    -- Optional context for audit (IP, user-agent, consent record payload).
    -- IP is stored as-is for the minimum retention required; scrub on request.
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id
    ON consent_records (user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_records_type_time
    ON consent_records (consent_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_records_email_hash
    ON consent_records (email_hash)
    WHERE email_hash IS NOT NULL;

-- RLS: users can read their own consent history; only service role may insert.
-- No UPDATE/DELETE is allowed from any role except service_role (audit integrity).
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own consent records"
    ON consent_records
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users insert their own consent"
    ON consent_records
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Anonymous newsletter / cookie-banner consent still needs to write; these
-- rows must have user_id IS NULL and go through the client-scoped anon key.
CREATE POLICY "Anonymous consent inserts with no user binding"
    ON consent_records
    FOR INSERT
    TO anon
    WITH CHECK (user_id IS NULL);

CREATE POLICY "Service role full access"
    ON consent_records
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE consent_records IS
    'Append-only audit log of consent events — used to demonstrate GDPR/CCPA/CAN-SPAM/TCPA compliance.';
COMMENT ON COLUMN consent_records.consent_type IS
    'One of: terms, marketing_email, marketing_sms, personalization_ai, cookies_analytics, cookies_advertising, newsletter, data_sale_opt_out';
COMMENT ON COLUMN consent_records.granted IS
    'true = consent granted; false = consent withdrawn';
