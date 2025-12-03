-- User Sessions Tracking
-- This table tracks active user sessions for security and management purposes

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  CONSTRAINT unique_session_id UNIQUE (session_id)
);

-- Indexes for performance
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity);

-- RLS Policies
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions"
  ON user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete (revoke) their own sessions
CREATE POLICY "Users can revoke own sessions"
  ON user_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can update their own sessions (for last_activity)
CREATE POLICY "Users can update own sessions"
  ON user_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_sessions
  SET is_active = FALSE
  WHERE expires_at < NOW()
    AND is_active = TRUE;

  -- Delete sessions older than 90 days
  DELETE FROM user_sessions
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Function to record/update session activity
CREATE OR REPLACE FUNCTION update_session_activity(
  p_user_id UUID,
  p_session_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS user_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session user_sessions;
BEGIN
  -- Try to update existing session
  UPDATE user_sessions
  SET last_activity = NOW(),
      ip_address = COALESCE(p_ip_address, ip_address),
      user_agent = COALESCE(p_user_agent, user_agent)
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND is_active = TRUE
  RETURNING * INTO v_session;

  -- If no session found, create new one
  IF NOT FOUND THEN
    INSERT INTO user_sessions (
      user_id,
      session_id,
      ip_address,
      user_agent,
      expires_at
    ) VALUES (
      p_user_id,
      p_session_id,
      p_ip_address,
      p_user_agent,
      NOW() + INTERVAL '7 days'
    )
    RETURNING * INTO v_session;
  END IF;

  RETURN v_session;
END;
$$;

-- Function to revoke a specific session
CREATE OR REPLACE FUNCTION revoke_session(p_session_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_sessions
  SET is_active = FALSE
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
    AND is_active = TRUE;

  RETURN FOUND;
END;
$$;

-- Function to revoke all sessions except current
CREATE OR REPLACE FUNCTION revoke_all_other_sessions(p_current_session_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revoked_count INTEGER;
BEGIN
  UPDATE user_sessions
  SET is_active = FALSE
  WHERE user_id = auth.uid()
    AND session_id != p_current_session_id
    AND is_active = TRUE;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;
  RETURN v_revoked_count;
END;
$$;

-- Scheduled cleanup (run daily via pg_cron or edge function)
-- This is a placeholder - actual scheduling should be done via pg_cron or Supabase cron
COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Should be run daily to clean up expired sessions';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_session_activity TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_session TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_all_other_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions TO authenticated;

-- Comments
COMMENT ON TABLE user_sessions IS 'Tracks active user sessions for security and management';
COMMENT ON COLUMN user_sessions.device_info IS 'JSON object containing device information (browser, OS, etc.)';
COMMENT ON COLUMN user_sessions.last_activity IS 'Last time this session was active';
COMMENT ON COLUMN user_sessions.expires_at IS 'When this session expires';
COMMENT ON COLUMN user_sessions.is_active IS 'Whether this session is currently active';
