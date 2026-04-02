-- Database-backed rate limiting to replace in-memory counters (SEC-030 fix)
-- Survives serverless cold starts and works across distributed instances

CREATE TABLE IF NOT EXISTS rate_limit_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id TEXT NOT NULL,
    endpoint TEXT NOT NULL DEFAULT 'default',
    window_start TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for fast lookups: client + endpoint + window
CREATE INDEX idx_rate_limit_client_window
    ON rate_limit_entries (client_id, endpoint, window_start);

-- Index for cleanup of expired entries
CREATE INDEX idx_rate_limit_created
    ON rate_limit_entries (created_at);

-- Upsert function: increment counter or create new entry
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_client_id TEXT,
    p_endpoint TEXT DEFAULT 'default',
    p_window_ms BIGINT DEFAULT 900000,  -- 15 minutes
    p_max_requests INT DEFAULT 100
)
RETURNS TABLE (
    allowed BOOLEAN,
    current_count INT,
    max_allowed INT,
    remaining INT,
    reset_at TIMESTAMPTZ
) LANGUAGE plpgsql AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_reset_at TIMESTAMPTZ;
    v_count INT;
BEGIN
    -- Calculate window boundaries
    v_window_start := TO_TIMESTAMP(
        FLOOR(EXTRACT(EPOCH FROM NOW()) / (p_window_ms / 1000.0)) * (p_window_ms / 1000.0)
    );
    v_reset_at := v_window_start + (p_window_ms / 1000.0) * INTERVAL '1 second';

    -- Upsert: increment existing or create new entry
    INSERT INTO rate_limit_entries (client_id, endpoint, window_start, request_count, updated_at)
    VALUES (p_client_id, p_endpoint, v_window_start, 1, NOW())
    ON CONFLICT ON CONSTRAINT rate_limit_entries_unique_window
    DO UPDATE SET
        request_count = rate_limit_entries.request_count + 1,
        updated_at = NOW()
    RETURNING request_count INTO v_count;

    -- If no row was returned (shouldn't happen with upsert), check existing
    IF v_count IS NULL THEN
        SELECT COALESCE(SUM(request_count), 0) INTO v_count
        FROM rate_limit_entries
        WHERE client_id = p_client_id
          AND endpoint = p_endpoint
          AND window_start = v_window_start;
    END IF;

    RETURN QUERY SELECT
        v_count <= p_max_requests AS allowed,
        v_count AS current_count,
        p_max_requests AS max_allowed,
        GREATEST(0, p_max_requests - v_count) AS remaining,
        v_reset_at AS reset_at;
END;
$$;

-- Add unique constraint for upsert
ALTER TABLE rate_limit_entries
    ADD CONSTRAINT rate_limit_entries_unique_window
    UNIQUE (client_id, endpoint, window_start);

-- Cleanup function: remove entries older than 1 hour
CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM rate_limit_entries
    WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- RLS: only service role can access rate limit table
ALTER TABLE rate_limit_entries ENABLE ROW LEVEL SECURITY;

-- No public access — only accessible via service_role key (edge functions)
CREATE POLICY "Service role only" ON rate_limit_entries
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE rate_limit_entries IS 'Persistent rate limiting counters for edge functions (replaces in-memory storage)';
COMMENT ON FUNCTION check_rate_limit IS 'Atomic rate limit check with upsert — returns allowed status and current counts';
COMMENT ON FUNCTION cleanup_rate_limit_entries IS 'Removes expired rate limit entries — call on schedule or periodically';
