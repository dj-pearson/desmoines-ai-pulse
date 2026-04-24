-- Server-synced account lockout tracking (SEC-CROSS-001)
-- Records failed login attempts per email for cross-device lockout enforcement

CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL,
    client_info TEXT DEFAULT 'unknown',
    client_ip TEXT DEFAULT 'unknown',
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by email + time window
CREATE INDEX idx_login_attempts_email_time
    ON login_attempts (email, attempted_at DESC);

-- Index for cleanup queries
CREATE INDEX idx_login_attempts_attempted_at
    ON login_attempts (attempted_at);

-- RLS: only service role can access (edge functions only)
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON login_attempts
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Cleanup function: remove entries older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_login_attempts()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM login_attempts
    WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$;

COMMENT ON TABLE login_attempts IS 'Failed login attempt tracking for cross-device account lockout';
COMMENT ON FUNCTION cleanup_login_attempts IS 'Removes login attempts older than 24 hours';
