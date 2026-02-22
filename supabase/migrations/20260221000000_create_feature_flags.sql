-- Feature flags table for toggling features without code deployments
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  target_tiers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER set_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- RLS: public read, admin-only write
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for feature flags"
  ON feature_flags FOR SELECT
  USING (true);

CREATE POLICY "Admin-only insert for feature flags"
  ON feature_flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

CREATE POLICY "Admin-only update for feature flags"
  ON feature_flags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

CREATE POLICY "Admin-only delete for feature flags"
  ON feature_flags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
    )
  );

-- Seed initial feature flags
INSERT INTO feature_flags (flag_key, enabled, description, target_tiers) VALUES
  ('search_traffic_dashboard', true, 'Show the search traffic dashboard in admin analytics', ARRAY['admin']),
  ('ai_trip_planner_v2', false, 'Enable the v2 AI trip planner with enhanced itinerary generation', ARRAY['insider', 'vip']),
  ('mobile_app_banner', false, 'Display a banner promoting the upcoming mobile app', ARRAY['free', 'insider', 'vip'])
ON CONFLICT (flag_key) DO NOTHING;
