-- pSEO 2.0 Pipeline Tables
-- Generation queue and audit log for the pSEO generation pipeline

-- Generation queue table for pipeline orchestration
CREATE TABLE IF NOT EXISTS pseo_generation_queue (
  id TEXT PRIMARY KEY,
  page_type_id TEXT NOT NULL,
  dimensions JSONB NOT NULL,
  tier INTEGER NOT NULL DEFAULT 2,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'insufficient_data', 'deferred')),
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pseo_queue_status ON pseo_generation_queue(status, tier, priority);
CREATE INDEX IF NOT EXISTS idx_pseo_queue_page_type ON pseo_generation_queue(page_type_id);

-- Generation log for audit trail
CREATE TABLE IF NOT EXISTS pseo_generation_log (
  id SERIAL PRIMARY KEY,
  page_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('generated', 'regenerated', 'published', 'unpublished', 'failed', 'quality_check')),
  details JSONB DEFAULT '{}',
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  generation_time_ms INTEGER,
  quality_score NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pseo_log_page ON pseo_generation_log(page_id);
CREATE INDEX IF NOT EXISTS idx_pseo_log_action ON pseo_generation_log(action);
CREATE INDEX IF NOT EXISTS idx_pseo_log_created ON pseo_generation_log(created_at DESC);

-- RLS policies
ALTER TABLE pseo_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE pseo_generation_log ENABLE ROW LEVEL SECURITY;

-- Service role full access (for Edge Functions and n8n)
DO $$ BEGIN
  CREATE POLICY "Service role full access queue" ON pseo_generation_queue FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access log" ON pseo_generation_log FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin read access
DO $$ BEGIN
  CREATE POLICY "Admin read queue" ON pseo_generation_queue FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin read log" ON pseo_generation_log FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Helper function to enqueue a page generation
CREATE OR REPLACE FUNCTION enqueue_pseo_generation(
  p_id TEXT,
  p_page_type_id TEXT,
  p_dimensions JSONB,
  p_tier INTEGER DEFAULT 2,
  p_priority INTEGER DEFAULT 50
) RETURNS void AS $$
BEGIN
  INSERT INTO pseo_generation_queue (id, page_type_id, dimensions, tier, priority)
  VALUES (p_id, p_page_type_id, p_dimensions, p_tier, p_priority)
  ON CONFLICT (id) DO UPDATE SET
    status = 'pending',
    attempts = 0,
    error_message = NULL,
    scheduled_at = now()
  WHERE pseo_generation_queue.status IN ('failed', 'insufficient_data', 'deferred');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to log generation events
CREATE OR REPLACE FUNCTION log_pseo_generation(
  p_page_id TEXT,
  p_action TEXT,
  p_details JSONB DEFAULT '{}',
  p_model TEXT DEFAULT NULL,
  p_input_tokens INTEGER DEFAULT NULL,
  p_output_tokens INTEGER DEFAULT NULL,
  p_time_ms INTEGER DEFAULT NULL,
  p_quality NUMERIC DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO pseo_generation_log (
    page_id, action, details, model_used,
    input_tokens, output_tokens, generation_time_ms, quality_score
  ) VALUES (
    p_page_id, p_action, p_details, p_model,
    p_input_tokens, p_output_tokens, p_time_ms, p_quality
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
