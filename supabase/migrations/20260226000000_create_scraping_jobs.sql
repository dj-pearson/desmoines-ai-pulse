-- Scraping jobs persistence table (US-020)
-- Persists scraping job configuration, status, and results in the database
-- so that job history is tracked, queryable, and survives page refreshes.

CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'event_scraper',
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'pending', 'running', 'completed', 'failed', 'stopped', 'scheduled_for_trigger')),
  config JSONB NOT NULL DEFAULT '{}',
  results JSONB DEFAULT NULL,
  events_found INTEGER DEFAULT 0,
  last_run TIMESTAMPTZ DEFAULT NULL,
  next_run TIMESTAMPTZ DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS set_scraping_jobs_updated_at ON scraping_jobs;
CREATE TRIGGER set_scraping_jobs_updated_at
  BEFORE UPDATE ON scraping_jobs
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- RLS: admins can CRUD, authenticated users can read their own jobs
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can read all scraping jobs"
    ON scraping_jobs FOR SELECT
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert scraping jobs"
    ON scraping_jobs FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update scraping jobs"
    ON scraping_jobs FOR UPDATE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete scraping jobs"
    ON scraping_jobs FOR DELETE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for common queries
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs (status);
CREATE INDEX idx_scraping_jobs_job_type ON scraping_jobs (job_type);
CREATE INDEX idx_scraping_jobs_last_run ON scraping_jobs (last_run DESC NULLS LAST);

-- Seed default Des Moines event scraping jobs
INSERT INTO scraping_jobs (id, name, job_type, status, config) VALUES
  (gen_random_uuid(), 'Catch Des Moines Events', 'event_scraper', 'idle', '{"url": "https://www.catchdesmoines.com/events/", "schedule": "0 */6 * * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Iowa Cubs Schedule', 'event_scraper', 'idle', '{"url": "https://www.milb.com/iowa/schedule", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Iowa Wolves G-League', 'event_scraper', 'idle', '{"url": "https://iowa.gleague.nba.com/schedule", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Iowa Wild Hockey', 'event_scraper', 'idle', '{"url": "https://www.iowawild.com/games", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Iowa Barnstormers Arena Football', 'event_scraper', 'idle', '{"url": "https://theiowabarnstormers.com/", "schedule": "0 0 */2 * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Iowa Events Center', 'event_scraper', 'idle', '{"url": "https://www.iowaeventscenter.com/", "schedule": "0 */8 * * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Vibrant Music Hall', 'event_scraper', 'idle', '{"url": "https://www.vibrantmusichall.com/", "schedule": "0 */6 * * *", "isActive": true}'::jsonb),
  (gen_random_uuid(), 'Google Events - Des Moines', 'event_scraper', 'idle', '{"url": "https://www.google.com/search?q=events+in+des+moines+iowa", "schedule": "0 */4 * * *", "isActive": true}'::jsonb)
ON CONFLICT DO NOTHING;
