-- ============================================================================
-- SEO Management System - Automated Monitoring & Alerts
-- ============================================================================
-- Description: Automated monitoring, alerting, and notification system for SEO
-- Created: 2025-11-05
-- Tables: 4 monitoring and alert tables
--   - seo_notification_preferences: User notification settings
--   - seo_alert_rules: Configurable alert rules and thresholds
--   - seo_alerts: Alert history and status
--   - seo_monitoring_schedules: Scheduled monitoring tasks
-- ============================================================================

-- ============================================================================
-- Table: seo_notification_preferences
-- Purpose: Configure how and when users receive SEO notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User Association
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Email Notifications
  email_enabled BOOLEAN DEFAULT true,
  email_address TEXT,
  email_frequency TEXT DEFAULT 'immediate' CHECK (email_frequency IN ('immediate', 'hourly', 'daily', 'weekly')),

  -- In-App Notifications
  in_app_enabled BOOLEAN DEFAULT true,

  -- Slack Integration
  slack_enabled BOOLEAN DEFAULT false,
  slack_webhook_url TEXT,
  slack_channel TEXT,

  -- Discord Integration
  discord_enabled BOOLEAN DEFAULT false,
  discord_webhook_url TEXT,

  -- SMS Notifications (if applicable)
  sms_enabled BOOLEAN DEFAULT false,
  phone_number TEXT,

  -- Alert Severity Thresholds (which severity levels trigger notifications)
  notify_critical BOOLEAN DEFAULT true,
  notify_high BOOLEAN DEFAULT true,
  notify_medium BOOLEAN DEFAULT false,
  notify_low BOOLEAN DEFAULT false,

  -- Alert Categories (which categories to receive)
  notify_performance BOOLEAN DEFAULT true, -- Core Web Vitals, page speed
  notify_keywords BOOLEAN DEFAULT true, -- Ranking changes
  notify_errors BOOLEAN DEFAULT true, -- 404s, broken links
  notify_security BOOLEAN DEFAULT true, -- HTTPS, security headers
  notify_content BOOLEAN DEFAULT false, -- Content quality issues
  notify_technical BOOLEAN DEFAULT true, -- Technical SEO issues

  -- Quiet Hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME, -- e.g., '22:00:00'
  quiet_hours_end TIME, -- e.g., '08:00:00'
  quiet_hours_timezone TEXT DEFAULT 'America/Chicago',

  -- Digest Settings
  digest_enabled BOOLEAN DEFAULT false,
  digest_day_of_week INTEGER CHECK (digest_day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  digest_time TIME DEFAULT '09:00:00',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_notif_prefs_user_id ON seo_notification_preferences(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_notif_prefs_user_unique ON seo_notification_preferences(user_id);

-- Comments
COMMENT ON TABLE seo_notification_preferences IS 'User preferences for SEO notifications across multiple channels';
COMMENT ON COLUMN seo_notification_preferences.quiet_hours_start IS 'Start of quiet hours (no notifications sent) in HH:MM:SS format';

-- ============================================================================
-- Table: seo_alert_rules
-- Purpose: Define conditions that trigger SEO alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Details
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Rule Category
  category TEXT NOT NULL CHECK (category IN (
    'performance',    -- Core Web Vitals, page speed
    'keywords',       -- Keyword ranking changes
    'errors',         -- 404s, broken links, crawl errors
    'security',       -- HTTPS, security headers
    'content',        -- Content quality, duplicate content
    'technical',      -- Technical SEO issues
    'backlinks',      -- Backlink changes
    'competitors'     -- Competitor activity
  )),

  -- Rule Type
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'threshold',      -- Metric crosses threshold
    'change',         -- Metric changes by percentage
    'absolute',       -- Metric reaches absolute value
    'pattern',        -- Pattern matching
    'anomaly'         -- Anomaly detection
  )),

  -- Metric Configuration
  metric TEXT NOT NULL, -- e.g., 'core_web_vital_lcp', 'keyword_position', 'broken_links_count'
  threshold_value DECIMAL(10,2), -- Threshold for 'threshold' and 'absolute' types
  threshold_operator TEXT CHECK (threshold_operator IN ('>', '<', '>=', '<=', '=', '!=')),

  -- For 'change' type rules
  change_percentage DECIMAL(5,2), -- e.g., 10.00 for 10% change
  change_direction TEXT CHECK (change_direction IN ('increase', 'decrease', 'any')),

  -- Time Window
  time_window_minutes INTEGER DEFAULT 60, -- How far back to look for changes
  require_consecutive_failures INTEGER DEFAULT 1, -- How many consecutive failures before alerting

  -- Severity
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Target Configuration
  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'specific_urls', 'url_pattern')),
  target_urls TEXT[], -- Specific URLs this rule applies to
  url_pattern TEXT, -- Regex pattern for URLs

  -- Actions
  auto_resolve BOOLEAN DEFAULT false, -- Auto-resolve when condition no longer met
  auto_resolve_after_minutes INTEGER DEFAULT 60,

  -- Rate Limiting
  max_alerts_per_day INTEGER DEFAULT 10, -- Prevent alert spam
  cooldown_minutes INTEGER DEFAULT 60, -- Minimum time between alerts for same rule

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_alert_rules_active ON seo_alert_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seo_alert_rules_category ON seo_alert_rules(category);
CREATE INDEX IF NOT EXISTS idx_seo_alert_rules_severity ON seo_alert_rules(severity);

-- Comments
COMMENT ON TABLE seo_alert_rules IS 'Configurable rules that trigger SEO alerts based on conditions';
COMMENT ON COLUMN seo_alert_rules.time_window_minutes IS 'Time window to evaluate rule conditions';

-- ============================================================================
-- Table: seo_alerts
-- Purpose: Store triggered alerts and their resolution status
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Reference
  rule_id UUID REFERENCES seo_alert_rules(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL, -- Denormalized for history
  rule_category TEXT NOT NULL,

  -- Alert Details
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Affected Target
  affected_url TEXT,
  affected_urls TEXT[], -- Multiple URLs if applicable

  -- Metric Information
  metric_name TEXT,
  metric_value DECIMAL(10,2),
  threshold_value DECIMAL(10,2),
  previous_value DECIMAL(10,2),

  -- Additional Context (JSONB for flexibility)
  context JSONB, -- Additional data about what triggered the alert

  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive', 'ignored')),
  resolution_notes TEXT,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  -- Auto-resolution
  auto_resolved BOOLEAN DEFAULT false,

  -- Notification Status
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  notification_channels TEXT[], -- Which channels were notified: ['email', 'slack', 'discord']

  -- Related Alerts (for grouping)
  parent_alert_id UUID REFERENCES seo_alerts(id),
  alert_group_id UUID -- For grouping related alerts together
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_alerts_rule_id ON seo_alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_seo_alerts_status ON seo_alerts(status);
CREATE INDEX IF NOT EXISTS idx_seo_alerts_severity ON seo_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_seo_alerts_category ON seo_alerts(rule_category);
CREATE INDEX IF NOT EXISTS idx_seo_alerts_created_at ON seo_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_alerts_url ON seo_alerts(affected_url);
CREATE INDEX IF NOT EXISTS idx_seo_alerts_assigned ON seo_alerts(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seo_alerts_open ON seo_alerts(status, severity, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_seo_alerts_group ON seo_alerts(alert_group_id) WHERE alert_group_id IS NOT NULL;

-- Comments
COMMENT ON TABLE seo_alerts IS 'SEO alerts triggered by monitoring rules';
COMMENT ON COLUMN seo_alerts.context IS 'Additional contextual data about what triggered the alert';

-- ============================================================================
-- Table: seo_monitoring_schedules
-- Purpose: Define scheduled SEO monitoring tasks
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_monitoring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Schedule Details
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Task Type
  task_type TEXT NOT NULL CHECK (task_type IN (
    'full_audit',           -- Complete SEO audit
    'quick_audit',          -- Quick SEO check
    'keyword_check',        -- Check keyword positions
    'broken_links',         -- Check for broken links
    'core_web_vitals',      -- Check Core Web Vitals
    'crawl',                -- Crawl site for issues
    'competitor_analysis',  -- Analyze competitors
    'backlink_sync',        -- Sync backlinks
    'gsc_sync',             -- Sync Google Search Console data
    'sitemap_generate'      -- Generate sitemap
  )),

  -- Schedule Configuration
  frequency TEXT NOT NULL CHECK (frequency IN (
    'continuous',   -- Run continuously (with interval)
    'hourly',       -- Every hour
    'daily',        -- Once per day
    'weekly',       -- Once per week
    'monthly',      -- Once per month
    'custom'        -- Custom cron expression
  )),

  -- Frequency Details
  interval_minutes INTEGER, -- For 'continuous' frequency
  hour_of_day INTEGER CHECK (hour_of_day BETWEEN 0 AND 23), -- For 'daily'
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- For 'weekly' (0=Sunday)
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31), -- For 'monthly'
  cron_expression TEXT, -- For 'custom' frequency (e.g., '0 2 * * *')
  timezone TEXT DEFAULT 'America/Chicago',

  -- Target Configuration
  target_url TEXT, -- Primary URL to monitor
  target_urls TEXT[], -- Multiple URLs if applicable
  url_pattern TEXT, -- Regex pattern for URL matching

  -- Task Parameters (JSONB for flexibility)
  parameters JSONB, -- Task-specific configuration
  -- Examples:
  -- For 'crawl': {"max_pages": 100, "max_depth": 3}
  -- For 'keyword_check': {"keywords": ["des moines events", "iowa restaurants"]}
  -- For 'core_web_vitals': {"devices": ["mobile", "desktop"]}

  -- Execution Settings
  timeout_minutes INTEGER DEFAULT 30,
  retry_on_failure BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,

  -- Status Tracking
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'warning', 'error', 'timeout', 'skipped')),
  last_run_duration_ms INTEGER,
  next_run_at TIMESTAMPTZ,

  -- Execution Count
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,

  -- Error Tracking
  consecutive_failures INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  -- Auto-disable after failures
  auto_disable_after_failures INTEGER DEFAULT 5,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_schedules_active ON seo_monitoring_schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_schedules_next_run ON seo_monitoring_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_schedules_type ON seo_monitoring_schedules(task_type);
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_schedules_frequency ON seo_monitoring_schedules(frequency);

-- Comments
COMMENT ON TABLE seo_monitoring_schedules IS 'Scheduled SEO monitoring tasks with flexible frequency configuration';
COMMENT ON COLUMN seo_monitoring_schedules.parameters IS 'Task-specific configuration parameters in JSON format';

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE seo_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_monitoring_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: Admin-only access
-- ============================================================================

CREATE POLICY "Admin full access to seo_notification_preferences"
  ON seo_notification_preferences FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_alert_rules"
  ON seo_alert_rules FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_alerts"
  ON seo_alerts FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_monitoring_schedules"
  ON seo_monitoring_schedules FOR ALL
  USING (is_admin());

-- ============================================================================
-- Triggers for updated_at timestamps
-- ============================================================================

CREATE TRIGGER update_seo_notification_preferences_updated_at
  BEFORE UPDATE ON seo_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_alert_rules_updated_at
  BEFORE UPDATE ON seo_alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_monitoring_schedules_updated_at
  BEFORE UPDATE ON seo_monitoring_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions for Monitoring & Alerts
-- ============================================================================

-- Function to check if user is in quiet hours
CREATE OR REPLACE FUNCTION is_in_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  prefs RECORD;
  current_time_in_tz TIME;
BEGIN
  SELECT *
  INTO prefs
  FROM seo_notification_preferences
  WHERE user_id = p_user_id AND quiet_hours_enabled = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Get current time in user's timezone
  current_time_in_tz := (now() AT TIME ZONE prefs.quiet_hours_timezone)::TIME;

  -- Check if current time is within quiet hours
  IF prefs.quiet_hours_start <= prefs.quiet_hours_end THEN
    -- Normal case: quiet hours within same day (e.g., 22:00 to 08:00 next day)
    RETURN current_time_in_tz >= prefs.quiet_hours_start
       AND current_time_in_tz <= prefs.quiet_hours_end;
  ELSE
    -- Quiet hours span midnight (e.g., 22:00 to 08:00)
    RETURN current_time_in_tz >= prefs.quiet_hours_start
        OR current_time_in_tz <= prefs.quiet_hours_end;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate next run time for scheduled tasks
CREATE OR REPLACE FUNCTION calculate_next_run_time(schedule_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  sched RECORD;
  next_run TIMESTAMPTZ;
  tz_offset INTERVAL;
BEGIN
  SELECT *
  INTO sched
  FROM seo_monitoring_schedules
  WHERE id = schedule_id;

  IF NOT FOUND OR NOT sched.is_active THEN
    RETURN NULL;
  END IF;

  -- Calculate based on frequency
  CASE sched.frequency
    WHEN 'continuous' THEN
      next_run := now() + (sched.interval_minutes || ' minutes')::INTERVAL;

    WHEN 'hourly' THEN
      next_run := date_trunc('hour', now()) + INTERVAL '1 hour';

    WHEN 'daily' THEN
      -- Schedule at specific hour
      next_run := (CURRENT_DATE + INTERVAL '1 day' + (sched.hour_of_day || ' hours')::INTERVAL) AT TIME ZONE sched.timezone;
      IF next_run <= now() THEN
        next_run := next_run + INTERVAL '1 day';
      END IF;

    WHEN 'weekly' THEN
      -- Schedule at specific day of week and hour
      next_run := date_trunc('week', now()) + (sched.day_of_week || ' days')::INTERVAL + (sched.hour_of_day || ' hours')::INTERVAL;
      IF next_run <= now() THEN
        next_run := next_run + INTERVAL '1 week';
      END IF;

    WHEN 'monthly' THEN
      -- Schedule at specific day of month and hour
      next_run := date_trunc('month', now()) + ((sched.day_of_month - 1) || ' days')::INTERVAL + (sched.hour_of_day || ' hours')::INTERVAL;
      IF next_run <= now() THEN
        next_run := date_trunc('month', now() + INTERVAL '1 month') + ((sched.day_of_month - 1) || ' days')::INTERVAL + (sched.hour_of_day || ' hours')::INTERVAL;
      END IF;

    WHEN 'custom' THEN
      -- For custom cron expressions, calculate manually or use extension
      -- For now, default to 1 day
      next_run := now() + INTERVAL '1 day';

    ELSE
      next_run := NULL;
  END CASE;

  RETURN next_run;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update schedule after execution
CREATE OR REPLACE FUNCTION update_schedule_after_execution(
  p_schedule_id UUID,
  p_status TEXT,
  p_duration_ms INTEGER,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE seo_monitoring_schedules
  SET
    last_run_at = now(),
    last_run_status = p_status,
    last_run_duration_ms = p_duration_ms,
    total_runs = total_runs + 1,
    successful_runs = CASE WHEN p_status = 'success' THEN successful_runs + 1 ELSE successful_runs END,
    failed_runs = CASE WHEN p_status IN ('error', 'timeout') THEN failed_runs + 1 ELSE failed_runs END,
    consecutive_failures = CASE WHEN p_status IN ('error', 'timeout') THEN consecutive_failures + 1 ELSE 0 END,
    last_error = p_error,
    last_error_at = CASE WHEN p_error IS NOT NULL THEN now() ELSE last_error_at END,
    next_run_at = calculate_next_run_time(p_schedule_id),
    is_active = CASE
      WHEN auto_disable_after_failures > 0
       AND consecutive_failures + 1 >= auto_disable_after_failures
       AND p_status IN ('error', 'timeout')
      THEN false
      ELSE is_active
    END,
    updated_at = now()
  WHERE id = p_schedule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to trigger alert
CREATE OR REPLACE FUNCTION trigger_seo_alert(
  p_rule_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_affected_url TEXT DEFAULT NULL,
  p_metric_value DECIMAL DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  rule RECORD;
  alert_id UUID;
  new_alert_group_id UUID;
BEGIN
  -- Get rule details
  SELECT *
  INTO rule
  FROM seo_alert_rules
  WHERE id = p_rule_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alert rule not found or inactive';
  END IF;

  -- Check rate limiting
  IF rule.last_triggered_at IS NOT NULL THEN
    IF now() - rule.last_triggered_at < (rule.cooldown_minutes || ' minutes')::INTERVAL THEN
      -- Still in cooldown period, skip alert
      RETURN NULL;
    END IF;
  END IF;

  -- Check max alerts per day
  IF rule.max_alerts_per_day > 0 THEN
    DECLARE
      alerts_today INTEGER;
    BEGIN
      SELECT COUNT(*)
      INTO alerts_today
      FROM seo_alerts
      WHERE rule_id = p_rule_id
        AND created_at >= CURRENT_DATE;

      IF alerts_today >= rule.max_alerts_per_day THEN
        -- Max alerts reached, skip
        RETURN NULL;
      END IF;
    END;
  END IF;

  -- Create alert
  new_alert_group_id := gen_random_uuid();

  INSERT INTO seo_alerts (
    rule_id,
    rule_name,
    rule_category,
    severity,
    title,
    message,
    affected_url,
    metric_name,
    metric_value,
    threshold_value,
    context,
    alert_group_id
  ) VALUES (
    p_rule_id,
    rule.name,
    rule.category,
    rule.severity,
    p_title,
    p_message,
    p_affected_url,
    rule.metric,
    p_metric_value,
    rule.threshold_value,
    p_context,
    new_alert_group_id
  )
  RETURNING id INTO alert_id;

  -- Update rule tracking
  UPDATE seo_alert_rules
  SET
    last_triggered_at = now(),
    trigger_count = trigger_count + 1,
    updated_at = now()
  WHERE id = p_rule_id;

  RETURN alert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-resolve alerts
CREATE OR REPLACE FUNCTION auto_resolve_alerts()
RETURNS INTEGER AS $$
DECLARE
  resolved_count INTEGER := 0;
BEGIN
  -- Auto-resolve alerts that meet their rule's auto-resolve criteria
  WITH resolved AS (
    UPDATE seo_alerts a
    SET
      status = 'resolved',
      resolved_at = now(),
      auto_resolved = true
    FROM seo_alert_rules r
    WHERE a.rule_id = r.id
      AND a.status = 'open'
      AND r.auto_resolve = true
      AND r.auto_resolve_after_minutes > 0
      AND a.created_at < now() - (r.auto_resolve_after_minutes || ' minutes')::INTERVAL
    RETURNING a.id
  )
  SELECT COUNT(*) INTO resolved_count FROM resolved;

  RETURN resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Initial Data: Create default notification preferences and alert rules
-- ============================================================================

-- Default alert rules
INSERT INTO seo_alert_rules (name, description, category, rule_type, metric, threshold_value, threshold_operator, severity, is_active) VALUES
('Critical Page Load Time', 'Alert when page load time exceeds 5 seconds', 'performance', 'threshold', 'page_load_time_ms', 5000, '>', 'high', true),
('Low Core Web Vitals Score', 'Alert when CWV score drops below 50', 'performance', 'threshold', 'cwv_score', 50, '<', 'high', true),
('Broken Links Found', 'Alert when broken links are detected', 'errors', 'threshold', 'broken_links_count', 0, '>', 'medium', true),
('Keyword Position Drop', 'Alert when keyword drops by more than 5 positions', 'keywords', 'change', 'keyword_position', 5, '>', 'medium', true),
('Missing HTTPS', 'Alert when pages are not using HTTPS', 'security', 'threshold', 'https_pages_percentage', 100, '<', 'critical', true),
('Duplicate Content Detected', 'Alert when duplicate content is found', 'content', 'threshold', 'duplicate_content_count', 0, '>', 'low', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of Migration
-- ============================================================================
