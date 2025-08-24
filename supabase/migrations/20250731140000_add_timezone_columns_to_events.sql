-- Add columns for robust time zone handling
ALTER TABLE events
ADD COLUMN IF NOT EXISTS event_start_local TIMESTAMP WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS event_timezone TEXT,
ADD COLUMN IF NOT EXISTS event_start_utc TIMESTAMP WITH TIME ZONE;

-- Optional: If you want to drop the old 'date' column after successful migration and backfill
-- ALTER TABLE events DROP COLUMN IF EXISTS date;
