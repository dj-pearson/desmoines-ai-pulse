-- Auto-cleanup of past events with optional archival
-- Keeps the main events table lean and performant by removing old events

-- Step 1: Create archived_events table for historical data (optional backup)
CREATE TABLE IF NOT EXISTS archived_events (
  LIKE events INCLUDING ALL
);

-- Add archival timestamp
ALTER TABLE archived_events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for archived events
CREATE INDEX IF NOT EXISTS archived_events_date_idx ON archived_events(date);
CREATE INDEX IF NOT EXISTS archived_events_archived_at_idx ON archived_events(archived_at);

-- Step 2: Create function to archive and cleanup old events
CREATE OR REPLACE FUNCTION cleanup_old_events(
  days_old INTEGER DEFAULT 90,
  archive_before_delete BOOLEAN DEFAULT true
)
RETURNS TABLE (
  events_archived INTEGER,
  events_deleted INTEGER
) AS $$
DECLARE
  archived_count INTEGER := 0;
  deleted_count INTEGER := 0;
  cutoff_date TIMESTAMPTZ;
BEGIN
  -- Calculate cutoff date
  cutoff_date := NOW() - (days_old || ' days')::INTERVAL;

  RAISE NOTICE 'Cleaning up events older than % (before %)', days_old || ' days', cutoff_date;

  -- Archive events if requested
  IF archive_before_delete THEN
    INSERT INTO archived_events
    SELECT *, NOW() as archived_at
    FROM events
    WHERE date < cutoff_date
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RAISE NOTICE 'Archived % events', archived_count;
  END IF;

  -- Delete old events from main table
  DELETE FROM events
  WHERE date < cutoff_date;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % events from main table', deleted_count;

  RETURN QUERY SELECT archived_count, deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Schedule weekly cleanup (every Sunday at 5 AM)
SELECT cron.schedule(
  'cleanup-old-events-weekly',
  '0 5 * * 0',  -- Every Sunday at 5:00 AM
  $$
  SELECT * FROM cleanup_old_events(
    days_old := 90,  -- Events older than 90 days
    archive_before_delete := true  -- Archive before deleting
  );
  $$
);

-- Step 4: Grant necessary permissions
GRANT SELECT ON archived_events TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_events TO postgres;

-- Step 5: Add comments for documentation
COMMENT ON TABLE archived_events IS 'Historical archive of past events (older than 90 days) for analytics and record-keeping';
COMMENT ON FUNCTION cleanup_old_events IS 'Archives and deletes events older than specified days (default: 90 days)';

-- Log the scheduled job
DO $$
BEGIN
  RAISE NOTICE 'Cron job "cleanup-old-events-weekly" scheduled to run every Sunday at 5:00 AM';
  RAISE NOTICE 'Archives events older than 90 days to archived_events table';
  RAISE NOTICE 'Then deletes them from main events table to maintain performance';
END $$;
