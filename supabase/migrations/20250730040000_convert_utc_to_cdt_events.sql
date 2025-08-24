-- Convert existing UTC midnight dates to proper CDT evening times
-- This migration fixes events that were stored as UTC midnight but should be CDT evening events

-- First, let's see what we're working with
-- SELECT id, title, date, date AT TIME ZONE 'America/Chicago' as cdt_date FROM events ORDER BY date LIMIT 10;

-- Convert UTC midnight dates to CDT evening times
-- Most events are typically in the evening (7-8pm), so we'll use 7:30pm CDT as default
-- UTC midnight becomes CDT 6pm previous day (during CDT) or 7pm previous day (during CST)

UPDATE public.events 
SET 
    date = (
        -- Convert to CDT/CST and set to 7:30 PM
        (date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date + INTERVAL '19 hours 30 minutes'
    ) AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
    updated_at = now()
WHERE 
    -- Only update events that are stored as midnight UTC (likely the problematic ones)
    EXTRACT(HOUR FROM date AT TIME ZONE 'UTC') = 0 
    AND EXTRACT(MINUTE FROM date AT TIME ZONE 'UTC') = 0 
    AND EXTRACT(SECOND FROM date AT TIME ZONE 'UTC') = 0;

-- Log the changes made
INSERT INTO public.migration_logs (migration_name, description, affected_rows, created_at)
SELECT 
    '20250730040000_convert_utc_to_cdt_events',
    'Converted UTC midnight events to CDT evening times (7:30 PM)',
    (SELECT COUNT(*) FROM events WHERE EXTRACT(HOUR FROM date AT TIME ZONE 'UTC') = 0),
    now()
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_logs');

-- Create migration_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.migration_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    migration_name TEXT NOT NULL,
    description TEXT,
    affected_rows INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);
