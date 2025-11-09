-- Content Queue for Approval Workflow
-- Stores submissions awaiting review with validation results

CREATE TABLE IF NOT EXISTS content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'attraction', 'playground', 'article')),
  content_id UUID,
  content_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_review')),
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  validation_results JSONB,
  submitted_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_confidence ON content_queue(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_queue_submitted_at ON content_queue(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_queue_content_type ON content_queue(content_type);
CREATE INDEX IF NOT EXISTS idx_content_queue_submitted_by ON content_queue(submitted_by);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_content_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_queue_updated_at
  BEFORE UPDATE ON content_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_content_queue_updated_at();

-- System Events for Activity Stream
-- Logs all system events for monitoring and debugging

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL CHECK (event_type IN ('error', 'warning', 'info', 'security', 'performance')),
  severity INTEGER CHECK (severity BETWEEN 1 AND 5),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  user_id UUID REFERENCES auth.users(id),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_resolved ON system_events(resolved);

-- Auto-cleanup function for old events (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_system_events()
RETURNS void AS $$
BEGIN
  DELETE FROM system_events WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Webhook Logs for Debugging
-- Tracks webhook execution history

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_name TEXT NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retrying', 'timeout')),
  attempt INTEGER DEFAULT 1,
  response_code INTEGER,
  response_body JSONB,
  request_payload JSONB,
  error_message TEXT,
  retry_scheduled TIMESTAMPTZ,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_triggered_at ON webhook_logs(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_name ON webhook_logs(webhook_name);

-- Auto-cleanup function for old webhook logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_logs WHERE triggered_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Data Quality Scans
-- Stores results of automated quality scans

CREATE TABLE IF NOT EXISTS data_quality_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  scan_date TIMESTAMPTZ DEFAULT NOW(),
  issues_found JSONB,
  auto_fixed_count INTEGER DEFAULT 0,
  manual_review_count INTEGER DEFAULT 0,
  scan_duration_ms INTEGER,
  total_items_scanned INTEGER
);

-- Index
CREATE INDEX IF NOT EXISTS idx_data_quality_scans_date ON data_quality_scans(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_data_quality_scans_type ON data_quality_scans(content_type);

-- Import Jobs for CSV Import Tracking
-- Tracks bulk import operations

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  file_name TEXT,
  total_rows INTEGER,
  imported_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  error_log JSONB,
  validation_summary JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON import_jobs(created_by);

-- Auto-Approval Rules Configuration
-- Stores rules for automatic content approval

CREATE TABLE IF NOT EXISTS auto_approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  conditions JSONB NOT NULL,
  min_confidence_score INTEGER DEFAULT 90,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_applied_at TIMESTAMPTZ,
  application_count INTEGER DEFAULT 0
);

-- Index
CREATE INDEX IF NOT EXISTS idx_auto_approval_rules_enabled ON auto_approval_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_auto_approval_rules_type ON auto_approval_rules(content_type);
CREATE INDEX IF NOT EXISTS idx_auto_approval_rules_priority ON auto_approval_rules(priority DESC);

-- Comments for documentation
COMMENT ON TABLE content_queue IS 'Queue for content submissions awaiting approval';
COMMENT ON TABLE system_events IS 'System-wide events for monitoring and debugging';
COMMENT ON TABLE webhook_logs IS 'Execution history of webhooks for debugging';
COMMENT ON TABLE data_quality_scans IS 'Results of automated data quality scans';
COMMENT ON TABLE import_jobs IS 'Bulk import operation tracking';
COMMENT ON TABLE auto_approval_rules IS 'Rules for automatic content approval';

COMMENT ON COLUMN content_queue.confidence_score IS 'AI-calculated confidence score (0-100)';
COMMENT ON COLUMN content_queue.validation_results IS 'JSON array of validation results';
COMMENT ON COLUMN content_queue.content_data IS 'Full content object as JSON';

COMMENT ON COLUMN system_events.severity IS '1=Debug, 2=Info, 3=Warning, 4=Error, 5=Critical';
COMMENT ON COLUMN webhook_logs.attempt IS 'Retry attempt number (1 for first try)';
