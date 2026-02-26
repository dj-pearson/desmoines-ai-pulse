-- A/B testing support for feature flags (US-040)
-- Extends feature_flags with variant support and traffic splitting.

-- Add A/B testing columns to feature_flags
ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS traffic_split NUMERIC DEFAULT NULL;

-- Track variant assignments so each user sees a consistent experience
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL REFERENCES feature_flags(flag_key) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) DEFAULT NULL,
  session_id TEXT DEFAULT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flag_key, user_id),
  UNIQUE (flag_key, session_id)
);

ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;

-- Users can read their own assignments; admins can read all
CREATE POLICY "Users can read own experiment assignments"
  ON experiment_assignments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all experiment assignments"
  ON experiment_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

-- Allow insert for assignment tracking (service role or authenticated)
CREATE POLICY "Authenticated users can insert own experiment assignments"
  ON experiment_assignments FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_flag_key
  ON experiment_assignments (flag_key);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_user_id
  ON experiment_assignments (user_id);
