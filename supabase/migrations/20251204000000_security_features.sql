-- Security Features Migration
-- Implements: Password Policies, Session Timeout, Account Lockout, Login Activity,
-- Password Reset Security, Magic Links, and API Key Management

-- =====================================================
-- 1. PASSWORD COMPLEXITY POLICIES
-- =====================================================

-- Password policies configuration table
CREATE TABLE IF NOT EXISTS password_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  min_length INTEGER NOT NULL DEFAULT 8,
  max_length INTEGER NOT NULL DEFAULT 128,
  require_uppercase BOOLEAN NOT NULL DEFAULT TRUE,
  require_lowercase BOOLEAN NOT NULL DEFAULT TRUE,
  require_numbers BOOLEAN NOT NULL DEFAULT TRUE,
  require_special_chars BOOLEAN NOT NULL DEFAULT TRUE,
  special_char_set TEXT DEFAULT '!@#$%^&*()_+-=[]{}|;:,.<>?',
  min_unique_chars INTEGER DEFAULT 5,
  max_repeated_chars INTEGER DEFAULT 3,
  password_history_count INTEGER DEFAULT 5,
  password_expiry_days INTEGER DEFAULT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default password policy
INSERT INTO password_policies (name, is_default, is_active)
VALUES ('Standard', TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Password history tracking for users
CREATE TABLE IF NOT EXISTS user_password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_history_user ON user_password_history(user_id);
CREATE INDEX idx_password_history_created ON user_password_history(created_at DESC);

-- RLS for password_policies (admins only for write, all authenticated can read)
ALTER TABLE password_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read password policies"
  ON password_policies FOR SELECT
  USING (TRUE);

CREATE POLICY "Only admins can modify password policies"
  ON password_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

-- RLS for password history (no direct access)
ALTER TABLE user_password_history ENABLE ROW LEVEL SECURITY;

-- Function to get active password policy
CREATE OR REPLACE FUNCTION get_active_password_policy()
RETURNS password_policies
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_policy password_policies;
BEGIN
  SELECT * INTO v_policy
  FROM password_policies
  WHERE is_active = TRUE AND is_default = TRUE
  LIMIT 1;

  RETURN v_policy;
END;
$$;

-- Function to validate password against policy
CREATE OR REPLACE FUNCTION validate_password_policy(
  p_password TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_policy password_policies;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_history_count INTEGER;
  v_special_pattern TEXT;
BEGIN
  -- Get active policy
  SELECT * INTO v_policy FROM password_policies WHERE is_active = TRUE AND is_default = TRUE LIMIT 1;

  IF v_policy IS NULL THEN
    RETURN jsonb_build_object('valid', TRUE, 'errors', '[]'::jsonb);
  END IF;

  -- Check minimum length
  IF LENGTH(p_password) < v_policy.min_length THEN
    v_errors := array_append(v_errors, format('Password must be at least %s characters', v_policy.min_length));
  END IF;

  -- Check maximum length
  IF LENGTH(p_password) > v_policy.max_length THEN
    v_errors := array_append(v_errors, format('Password must be at most %s characters', v_policy.max_length));
  END IF;

  -- Check uppercase
  IF v_policy.require_uppercase AND p_password !~ '[A-Z]' THEN
    v_errors := array_append(v_errors, 'Password must contain at least one uppercase letter');
  END IF;

  -- Check lowercase
  IF v_policy.require_lowercase AND p_password !~ '[a-z]' THEN
    v_errors := array_append(v_errors, 'Password must contain at least one lowercase letter');
  END IF;

  -- Check numbers
  IF v_policy.require_numbers AND p_password !~ '[0-9]' THEN
    v_errors := array_append(v_errors, 'Password must contain at least one number');
  END IF;

  -- Check special characters
  IF v_policy.require_special_chars AND v_policy.special_char_set IS NOT NULL THEN
    v_special_pattern := '[' || regexp_replace(v_policy.special_char_set, '([\[\]\\^$.|?*+()])', '\\\1', 'g') || ']';
    IF p_password !~ v_special_pattern THEN
      v_errors := array_append(v_errors, 'Password must contain at least one special character');
    END IF;
  END IF;

  -- Check password history if user provided
  IF p_user_id IS NOT NULL AND v_policy.password_history_count > 0 THEN
    SELECT COUNT(*) INTO v_history_count
    FROM user_password_history
    WHERE user_id = p_user_id
      AND password_hash = crypt(p_password, password_hash)
    ORDER BY created_at DESC
    LIMIT v_policy.password_history_count;

    IF v_history_count > 0 THEN
      v_errors := array_append(v_errors, format('Cannot reuse the last %s passwords', v_policy.password_history_count));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_errors, 1) IS NULL,
    'errors', to_jsonb(v_errors),
    'policy', jsonb_build_object(
      'min_length', v_policy.min_length,
      'require_uppercase', v_policy.require_uppercase,
      'require_lowercase', v_policy.require_lowercase,
      'require_numbers', v_policy.require_numbers,
      'require_special_chars', v_policy.require_special_chars
    )
  );
END;
$$;

-- =====================================================
-- 2. SESSION TIMEOUT CONFIGURATION
-- =====================================================

-- Session policies per role
CREATE TABLE IF NOT EXISTS session_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL UNIQUE,
  idle_timeout_minutes INTEGER NOT NULL DEFAULT 60,
  absolute_timeout_hours INTEGER NOT NULL DEFAULT 8,
  warning_before_expiry_minutes INTEGER NOT NULL DEFAULT 5,
  require_mfa_reauth BOOLEAN DEFAULT FALSE,
  allow_remember_me BOOLEAN DEFAULT TRUE,
  remember_me_days INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default session policies
INSERT INTO session_policies (role_name, idle_timeout_minutes, absolute_timeout_hours)
VALUES
  ('user', 60, 8),
  ('admin', 30, 4),
  ('root_admin', 15, 2)
ON CONFLICT (role_name) DO NOTHING;

-- RLS for session policies
ALTER TABLE session_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read session policies"
  ON session_policies FOR SELECT
  USING (TRUE);

CREATE POLICY "Only admins can modify session policies"
  ON session_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

-- Function to get session policy for a user
CREATE OR REPLACE FUNCTION get_user_session_policy(p_user_id UUID DEFAULT NULL)
RETURNS session_policies
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_policy session_policies;
  v_role TEXT;
BEGIN
  -- Get user's role
  SELECT role INTO v_role
  FROM user_roles
  WHERE user_id = COALESCE(p_user_id, auth.uid())
  LIMIT 1;

  -- Get policy for role, fallback to 'user' policy
  SELECT * INTO v_policy
  FROM session_policies
  WHERE role_name = COALESCE(v_role, 'user')
    AND is_active = TRUE
  LIMIT 1;

  -- If no policy found, get default user policy
  IF v_policy IS NULL THEN
    SELECT * INTO v_policy
    FROM session_policies
    WHERE role_name = 'user' AND is_active = TRUE
    LIMIT 1;
  END IF;

  RETURN v_policy;
END;
$$;

-- Add session timeout tracking to user_sessions
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS idle_timeout_at TIMESTAMPTZ;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS remember_me BOOLEAN DEFAULT FALSE;

-- Function to update session with timeout
CREATE OR REPLACE FUNCTION update_session_with_timeout(
  p_user_id UUID,
  p_session_id TEXT,
  p_remember_me BOOLEAN DEFAULT FALSE,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS user_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session user_sessions;
  v_policy session_policies;
BEGIN
  -- Get session policy
  v_policy := get_user_session_policy(p_user_id);

  -- Try to update existing session
  UPDATE user_sessions
  SET last_activity = NOW(),
      ip_address = COALESCE(p_ip_address, ip_address),
      user_agent = COALESCE(p_user_agent, user_agent),
      idle_timeout_at = NOW() + (v_policy.idle_timeout_minutes || ' minutes')::INTERVAL,
      remember_me = p_remember_me
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
      remember_me,
      idle_timeout_at,
      expires_at
    ) VALUES (
      p_user_id,
      p_session_id,
      p_ip_address,
      p_user_agent,
      p_remember_me,
      NOW() + (v_policy.idle_timeout_minutes || ' minutes')::INTERVAL,
      CASE
        WHEN p_remember_me THEN NOW() + (v_policy.remember_me_days || ' days')::INTERVAL
        ELSE NOW() + (v_policy.absolute_timeout_hours || ' hours')::INTERVAL
      END
    )
    RETURNING * INTO v_session;
  END IF;

  RETURN v_session;
END;
$$;

-- =====================================================
-- 3. ACCOUNT LOCKOUT POLICY
-- =====================================================

-- Create failed_login_attempts table if not exists (may already exist from previous migration)
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  attempt_time TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN DEFAULT FALSE,
  lockout_until TIMESTAMPTZ,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_failed_login_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_login_ip ON failed_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_login_time ON failed_login_attempts(attempt_time DESC);

-- RLS for failed_login_attempts
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all login attempts"
  ON failed_login_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

-- Account lockout settings
CREATE TABLE IF NOT EXISTS account_lockout_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  max_attempts INTEGER NOT NULL DEFAULT 5,
  lockout_duration_minutes INTEGER NOT NULL DEFAULT 15,
  lockout_escalation BOOLEAN DEFAULT TRUE,
  escalation_multiplier DECIMAL(3,1) DEFAULT 2.0,
  max_lockout_hours INTEGER DEFAULT 24,
  permanent_lockout_threshold INTEGER DEFAULT 10,
  notify_on_lockout BOOLEAN DEFAULT TRUE,
  notify_admin_on_permanent BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default lockout settings
INSERT INTO account_lockout_settings (max_attempts, lockout_duration_minutes)
VALUES (5, 15)
ON CONFLICT DO NOTHING;

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings account_lockout_settings;
  v_recent_failures INTEGER;
  v_lockout_until TIMESTAMPTZ;
  v_remaining_seconds INTEGER;
BEGIN
  -- Get lockout settings
  SELECT * INTO v_settings FROM account_lockout_settings WHERE is_active = TRUE LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object('locked', FALSE);
  END IF;

  -- Check for active lockout
  SELECT lockout_until INTO v_lockout_until
  FROM failed_login_attempts
  WHERE email = LOWER(p_email)
    AND lockout_until > NOW()
  ORDER BY lockout_until DESC
  LIMIT 1;

  IF v_lockout_until IS NOT NULL THEN
    v_remaining_seconds := EXTRACT(EPOCH FROM (v_lockout_until - NOW()))::INTEGER;
    RETURN jsonb_build_object(
      'locked', TRUE,
      'lockout_until', v_lockout_until,
      'remaining_seconds', v_remaining_seconds,
      'message', format('Account locked. Try again in %s minutes.', CEIL(v_remaining_seconds / 60.0))
    );
  END IF;

  -- Count recent failures
  SELECT COUNT(*) INTO v_recent_failures
  FROM failed_login_attempts
  WHERE email = LOWER(p_email)
    AND success = FALSE
    AND attempt_time > NOW() - (v_settings.lockout_duration_minutes || ' minutes')::INTERVAL;

  RETURN jsonb_build_object(
    'locked', FALSE,
    'recent_failures', v_recent_failures,
    'remaining_attempts', v_settings.max_attempts - v_recent_failures
  );
END;
$$;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings account_lockout_settings;
  v_recent_failures INTEGER;
  v_lockout_until TIMESTAMPTZ;
  v_lockout_duration INTEGER;
  v_user_id UUID;
BEGIN
  -- Get lockout settings
  SELECT * INTO v_settings FROM account_lockout_settings WHERE is_active = TRUE LIMIT 1;

  -- Get user_id if exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(p_email) LIMIT 1;

  IF p_success THEN
    -- Record successful login
    INSERT INTO failed_login_attempts (
      user_id, email, ip_address, user_agent, success
    ) VALUES (
      v_user_id, LOWER(p_email), p_ip_address, p_user_agent, TRUE
    );

    RETURN jsonb_build_object('success', TRUE);
  END IF;

  -- Count recent failures for this email
  SELECT COUNT(*) INTO v_recent_failures
  FROM failed_login_attempts
  WHERE email = LOWER(p_email)
    AND success = FALSE
    AND attempt_time > NOW() - (v_settings.lockout_duration_minutes || ' minutes')::INTERVAL;

  v_recent_failures := v_recent_failures + 1;

  -- Calculate lockout if threshold exceeded
  IF v_recent_failures >= v_settings.max_attempts THEN
    -- Calculate escalating lockout duration
    IF v_settings.lockout_escalation THEN
      v_lockout_duration := v_settings.lockout_duration_minutes *
        POWER(v_settings.escalation_multiplier, (v_recent_failures / v_settings.max_attempts) - 1);
      -- Cap at max lockout
      v_lockout_duration := LEAST(v_lockout_duration, v_settings.max_lockout_hours * 60);
    ELSE
      v_lockout_duration := v_settings.lockout_duration_minutes;
    END IF;

    v_lockout_until := NOW() + (v_lockout_duration || ' minutes')::INTERVAL;
  END IF;

  -- Record failed attempt
  INSERT INTO failed_login_attempts (
    user_id, email, ip_address, user_agent, success, lockout_until, failure_reason
  ) VALUES (
    v_user_id, LOWER(p_email), p_ip_address, p_user_agent, FALSE, v_lockout_until, p_failure_reason
  );

  RETURN jsonb_build_object(
    'success', FALSE,
    'locked', v_lockout_until IS NOT NULL,
    'lockout_until', v_lockout_until,
    'remaining_attempts', GREATEST(0, v_settings.max_attempts - v_recent_failures)
  );
END;
$$;

-- =====================================================
-- 4. LOGIN ACTIVITY LOGGING
-- =====================================================

-- Login activity log table
CREATE TABLE IF NOT EXISTS login_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  login_type TEXT NOT NULL, -- 'password', 'oauth_google', 'oauth_apple', 'magic_link', 'mfa_totp'
  ip_address INET,
  city TEXT,
  region TEXT,
  country TEXT,
  country_code TEXT,
  user_agent TEXT,
  device_type TEXT, -- 'desktop', 'mobile', 'tablet', 'unknown'
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  mfa_verified BOOLEAN DEFAULT FALSE,
  session_id TEXT,
  success BOOLEAN DEFAULT TRUE,
  failure_reason TEXT,
  risk_score INTEGER DEFAULT 0, -- 0-100, higher = more risky
  risk_factors TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_login_activity_user ON login_activity(user_id);
CREATE INDEX idx_login_activity_email ON login_activity(email);
CREATE INDEX idx_login_activity_created ON login_activity(created_at DESC);
CREATE INDEX idx_login_activity_ip ON login_activity(ip_address);
CREATE INDEX idx_login_activity_success ON login_activity(success);

-- RLS for login_activity
ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own login activity"
  ON login_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all login activity"
  ON login_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

-- Function to log login activity
CREATE OR REPLACE FUNCTION log_login_activity(
  p_email TEXT,
  p_login_type TEXT,
  p_success BOOLEAN DEFAULT TRUE,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_mfa_verified BOOLEAN DEFAULT FALSE,
  p_failure_reason TEXT DEFAULT NULL,
  p_geo_data JSONB DEFAULT NULL
)
RETURNS login_activity
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity login_activity;
  v_user_id UUID;
  v_device_type TEXT := 'unknown';
  v_browser TEXT;
  v_os TEXT;
  v_risk_score INTEGER := 0;
  v_risk_factors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get user_id if exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(p_email) LIMIT 1;

  -- Parse user agent for device/browser/OS (simplified)
  IF p_user_agent IS NOT NULL THEN
    IF p_user_agent ILIKE '%mobile%' OR p_user_agent ILIKE '%android%' OR p_user_agent ILIKE '%iphone%' THEN
      v_device_type := 'mobile';
    ELSIF p_user_agent ILIKE '%tablet%' OR p_user_agent ILIKE '%ipad%' THEN
      v_device_type := 'tablet';
    ELSE
      v_device_type := 'desktop';
    END IF;

    -- Browser detection (simplified)
    CASE
      WHEN p_user_agent ILIKE '%chrome%' AND p_user_agent NOT ILIKE '%edge%' THEN v_browser := 'Chrome';
      WHEN p_user_agent ILIKE '%firefox%' THEN v_browser := 'Firefox';
      WHEN p_user_agent ILIKE '%safari%' AND p_user_agent NOT ILIKE '%chrome%' THEN v_browser := 'Safari';
      WHEN p_user_agent ILIKE '%edge%' THEN v_browser := 'Edge';
      ELSE v_browser := 'Unknown';
    END CASE;

    -- OS detection (simplified)
    CASE
      WHEN p_user_agent ILIKE '%windows%' THEN v_os := 'Windows';
      WHEN p_user_agent ILIKE '%mac os%' THEN v_os := 'macOS';
      WHEN p_user_agent ILIKE '%linux%' THEN v_os := 'Linux';
      WHEN p_user_agent ILIKE '%android%' THEN v_os := 'Android';
      WHEN p_user_agent ILIKE '%iphone%' OR p_user_agent ILIKE '%ipad%' THEN v_os := 'iOS';
      ELSE v_os := 'Unknown';
    END CASE;
  END IF;

  -- Calculate risk score
  IF NOT p_success THEN
    v_risk_score := v_risk_score + 20;
    v_risk_factors := array_append(v_risk_factors, 'failed_attempt');
  END IF;

  -- Check for new device/location
  IF v_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM login_activity
      WHERE user_id = v_user_id
        AND ip_address = p_ip_address
        AND success = TRUE
      LIMIT 1
    ) THEN
      v_risk_score := v_risk_score + 30;
      v_risk_factors := array_append(v_risk_factors, 'new_ip');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM login_activity
      WHERE user_id = v_user_id
        AND device_type = v_device_type
        AND browser = v_browser
        AND success = TRUE
      LIMIT 1
    ) THEN
      v_risk_score := v_risk_score + 15;
      v_risk_factors := array_append(v_risk_factors, 'new_device');
    END IF;
  END IF;

  -- Insert activity log
  INSERT INTO login_activity (
    user_id,
    email,
    login_type,
    ip_address,
    city,
    region,
    country,
    country_code,
    user_agent,
    device_type,
    browser,
    os,
    mfa_verified,
    session_id,
    success,
    failure_reason,
    risk_score,
    risk_factors
  ) VALUES (
    v_user_id,
    LOWER(p_email),
    p_login_type,
    p_ip_address,
    p_geo_data->>'city',
    p_geo_data->>'region',
    p_geo_data->>'country',
    p_geo_data->>'country_code',
    p_user_agent,
    v_device_type,
    v_browser,
    v_os,
    p_mfa_verified,
    p_session_id,
    p_success,
    p_failure_reason,
    v_risk_score,
    v_risk_factors
  )
  RETURNING * INTO v_activity;

  RETURN v_activity;
END;
$$;

-- Function to get user's recent login activity
CREATE OR REPLACE FUNCTION get_user_login_activity(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS SETOF login_activity
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM login_activity
  WHERE user_id = COALESCE(p_user_id, auth.uid())
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 5. PASSWORD RESET SECURITY
-- =====================================================

-- Password reset tokens with enhanced security
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_reset_email ON password_reset_tokens(email);
CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at);

-- Password reset rate limiting
CREATE TABLE IF NOT EXISTS password_reset_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address INET,
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  window_reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE INDEX idx_reset_rate_email ON password_reset_rate_limits(email);
CREATE INDEX idx_reset_rate_ip ON password_reset_rate_limits(ip_address);

-- RLS for password reset tables
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_rate_limits ENABLE ROW LEVEL SECURITY;

-- Function to check password reset rate limit
CREATE OR REPLACE FUNCTION check_password_reset_rate_limit(
  p_email TEXT,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email_limit RECORD;
  v_ip_limit RECORD;
  v_max_requests INTEGER := 3;
  v_window_hours INTEGER := 1;
BEGIN
  -- Check email-based rate limit
  SELECT * INTO v_email_limit
  FROM password_reset_rate_limits
  WHERE email = LOWER(p_email)
    AND window_reset_at > NOW()
  LIMIT 1;

  IF v_email_limit IS NOT NULL AND v_email_limit.attempt_count >= v_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'email_rate_limit',
      'retry_after', EXTRACT(EPOCH FROM (v_email_limit.window_reset_at - NOW()))::INTEGER,
      'message', format('Too many password reset requests. Try again in %s minutes.',
        CEIL(EXTRACT(EPOCH FROM (v_email_limit.window_reset_at - NOW())) / 60))
    );
  END IF;

  -- Check IP-based rate limit if provided
  IF p_ip_address IS NOT NULL THEN
    SELECT * INTO v_ip_limit
    FROM password_reset_rate_limits
    WHERE ip_address = p_ip_address
      AND window_reset_at > NOW()
    LIMIT 1;

    IF v_ip_limit IS NOT NULL AND v_ip_limit.attempt_count >= (v_max_requests * 2) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'reason', 'ip_rate_limit',
        'retry_after', EXTRACT(EPOCH FROM (v_ip_limit.window_reset_at - NOW()))::INTEGER,
        'message', 'Too many requests from this location. Please try again later.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', TRUE);
END;
$$;

-- Function to record password reset request
CREATE OR REPLACE FUNCTION record_password_reset_request(
  p_email TEXT,
  p_ip_address INET DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update or insert email rate limit
  INSERT INTO password_reset_rate_limits (email, ip_address, attempt_count)
  VALUES (LOWER(p_email), p_ip_address, 1)
  ON CONFLICT (id) DO NOTHING;

  -- Try to update existing record
  UPDATE password_reset_rate_limits
  SET attempt_count = attempt_count + 1,
      last_attempt_at = NOW()
  WHERE email = LOWER(p_email)
    AND window_reset_at > NOW();

  IF NOT FOUND THEN
    INSERT INTO password_reset_rate_limits (email, ip_address, attempt_count, window_reset_at)
    VALUES (LOWER(p_email), p_ip_address, 1, NOW() + INTERVAL '1 hour');
  END IF;
END;
$$;

-- =====================================================
-- 6. PASSWORDLESS AUTHENTICATION (Magic Links)
-- =====================================================

-- Magic link tokens
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'login', -- 'login', 'signup', 'email_change'
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  ip_address INET,
  user_agent TEXT,
  redirect_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token ON magic_link_tokens(token_hash);
CREATE INDEX idx_magic_links_email ON magic_link_tokens(email);
CREATE INDEX idx_magic_links_expires ON magic_link_tokens(expires_at);

-- RLS for magic link tokens
ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- Magic link rate limiting settings
CREATE TABLE IF NOT EXISTS magic_link_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  max_requests_per_hour INTEGER DEFAULT 5,
  token_expiry_minutes INTEGER DEFAULT 15,
  allow_signup BOOLEAN DEFAULT TRUE,
  allow_login BOOLEAN DEFAULT TRUE,
  require_existing_account BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO magic_link_settings (max_requests_per_hour, token_expiry_minutes)
VALUES (5, 15)
ON CONFLICT DO NOTHING;

-- Function to check magic link rate limit
CREATE OR REPLACE FUNCTION check_magic_link_rate_limit(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings magic_link_settings;
  v_recent_count INTEGER;
BEGIN
  SELECT * INTO v_settings FROM magic_link_settings WHERE is_active = TRUE LIMIT 1;

  IF v_settings IS NULL THEN
    v_settings.max_requests_per_hour := 5;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM magic_link_tokens
  WHERE email = LOWER(p_email)
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent_count >= v_settings.max_requests_per_hour THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'message', 'Too many magic link requests. Please try again later.',
      'retry_after', 3600
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'remaining', v_settings.max_requests_per_hour - v_recent_count
  );
END;
$$;

-- =====================================================
-- 7. API KEY MANAGEMENT
-- =====================================================

-- API keys for user access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "pk_live_ab")
  permissions TEXT[] DEFAULT ARRAY['read']::TEXT[],
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[], -- e.g., 'events:read', 'restaurants:read'
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_day INTEGER DEFAULT 10000,
  allowed_ips INET[],
  allowed_origins TEXT[],
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  usage_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;

-- API key usage tracking
CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  request_body_size INTEGER,
  response_body_size INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_key_usage_key ON api_key_usage(api_key_id);
CREATE INDEX idx_api_key_usage_created ON api_key_usage(created_at DESC);
CREATE INDEX idx_api_key_usage_endpoint ON api_key_usage(endpoint);

-- RLS for API keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own API keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own API key usage"
  ON api_key_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM api_keys
      WHERE id = api_key_usage.api_key_id
      AND user_id = auth.uid()
    )
  );

-- Function to validate API key
CREATE OR REPLACE FUNCTION validate_api_key(
  p_key_hash TEXT,
  p_ip_address INET DEFAULT NULL,
  p_origin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key api_keys;
  v_minute_usage INTEGER;
  v_day_usage INTEGER;
BEGIN
  -- Find the API key
  SELECT * INTO v_key
  FROM api_keys
  WHERE key_hash = p_key_hash
    AND is_active = TRUE
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN jsonb_build_object('valid', FALSE, 'error', 'Invalid API key');
  END IF;

  -- Check expiry
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', FALSE, 'error', 'API key has expired');
  END IF;

  -- Check IP restrictions
  IF v_key.allowed_ips IS NOT NULL AND array_length(v_key.allowed_ips, 1) > 0 THEN
    IF p_ip_address IS NULL OR NOT (p_ip_address = ANY(v_key.allowed_ips)) THEN
      RETURN jsonb_build_object('valid', FALSE, 'error', 'IP not allowed');
    END IF;
  END IF;

  -- Check origin restrictions
  IF v_key.allowed_origins IS NOT NULL AND array_length(v_key.allowed_origins, 1) > 0 THEN
    IF p_origin IS NULL OR NOT (p_origin = ANY(v_key.allowed_origins)) THEN
      RETURN jsonb_build_object('valid', FALSE, 'error', 'Origin not allowed');
    END IF;
  END IF;

  -- Check rate limits
  SELECT COUNT(*) INTO v_minute_usage
  FROM api_key_usage
  WHERE api_key_id = v_key.id
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_minute_usage >= v_key.rate_limit_per_minute THEN
    RETURN jsonb_build_object('valid', FALSE, 'error', 'Rate limit exceeded (per minute)');
  END IF;

  SELECT COUNT(*) INTO v_day_usage
  FROM api_key_usage
  WHERE api_key_id = v_key.id
    AND created_at > NOW() - INTERVAL '1 day';

  IF v_day_usage >= v_key.rate_limit_per_day THEN
    RETURN jsonb_build_object('valid', FALSE, 'error', 'Rate limit exceeded (per day)');
  END IF;

  -- Update last used
  UPDATE api_keys
  SET last_used_at = NOW(),
      last_used_ip = p_ip_address,
      usage_count = usage_count + 1
  WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'user_id', v_key.user_id,
    'permissions', v_key.permissions,
    'scopes', v_key.scopes,
    'key_id', v_key.id
  );
END;
$$;

-- Function to create API key
CREATE OR REPLACE FUNCTION create_api_key(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_permissions TEXT[] DEFAULT ARRAY['read']::TEXT[],
  p_scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_expires_in_days INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key_id UUID;
  v_raw_key TEXT;
  v_key_hash TEXT;
  v_key_prefix TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate a random key
  v_raw_key := 'dmi_' || encode(gen_random_bytes(32), 'base64');
  v_raw_key := replace(replace(v_raw_key, '+', ''), '/', '');
  v_raw_key := substring(v_raw_key from 1 for 48);

  v_key_hash := encode(digest(v_raw_key, 'sha256'), 'hex');
  v_key_prefix := substring(v_raw_key from 1 for 12);

  IF p_expires_in_days IS NOT NULL THEN
    v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
  END IF;

  INSERT INTO api_keys (
    user_id,
    name,
    description,
    key_hash,
    key_prefix,
    permissions,
    scopes,
    expires_at
  ) VALUES (
    auth.uid(),
    p_name,
    p_description,
    v_key_hash,
    v_key_prefix,
    p_permissions,
    p_scopes,
    v_expires_at
  )
  RETURNING id INTO v_key_id;

  -- Return the raw key (only time it's visible)
  RETURN jsonb_build_object(
    'success', TRUE,
    'key_id', v_key_id,
    'api_key', v_raw_key,
    'prefix', v_key_prefix,
    'message', 'Store this API key securely. It will not be shown again.'
  );
END;
$$;

-- Function to revoke API key
CREATE OR REPLACE FUNCTION revoke_api_key(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE api_keys
  SET is_active = FALSE,
      updated_at = NOW()
  WHERE id = p_key_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_active_password_policy TO authenticated;
GRANT EXECUTE ON FUNCTION validate_password_policy TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_session_policy TO authenticated;
GRANT EXECUTE ON FUNCTION update_session_with_timeout TO authenticated;
GRANT EXECUTE ON FUNCTION is_account_locked TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt TO anon, authenticated;
GRANT EXECUTE ON FUNCTION log_login_activity TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_login_activity TO authenticated;
GRANT EXECUTE ON FUNCTION check_password_reset_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_password_reset_request TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_magic_link_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_api_key TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_api_key TO authenticated;

-- =====================================================
-- CLEANUP FUNCTIONS
-- =====================================================

-- Cleanup old data
CREATE OR REPLACE FUNCTION cleanup_security_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clean up old login activity (keep 90 days)
  DELETE FROM login_activity WHERE created_at < NOW() - INTERVAL '90 days';

  -- Clean up expired password reset tokens
  DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day';

  -- Clean up old rate limit records
  DELETE FROM password_reset_rate_limits WHERE window_reset_at < NOW() - INTERVAL '1 day';

  -- Clean up expired magic link tokens
  DELETE FROM magic_link_tokens WHERE expires_at < NOW() - INTERVAL '1 day';

  -- Clean up old failed login attempts (keep 30 days)
  DELETE FROM failed_login_attempts WHERE attempt_time < NOW() - INTERVAL '30 days';

  -- Clean up old API key usage (keep 30 days)
  DELETE FROM api_key_usage WHERE created_at < NOW() - INTERVAL '30 days';

  -- Clean up old password history (keep only required number per policy + buffer)
  DELETE FROM user_password_history
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
      FROM user_password_history
    ) sub
    WHERE rn <= 10
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_security_data TO authenticated;

-- Comments
COMMENT ON TABLE password_policies IS 'Configurable password complexity requirements';
COMMENT ON TABLE session_policies IS 'Session timeout policies per role';
COMMENT ON TABLE login_activity IS 'Detailed login activity audit log';
COMMENT ON TABLE api_keys IS 'Personal API access tokens for programmatic access';
COMMENT ON FUNCTION validate_password_policy IS 'Validates a password against the active policy';
COMMENT ON FUNCTION is_account_locked IS 'Checks if an account is locked due to failed attempts';
COMMENT ON FUNCTION log_login_activity IS 'Records login attempts with device and risk information';
COMMENT ON FUNCTION validate_api_key IS 'Validates an API key and checks rate limits';
