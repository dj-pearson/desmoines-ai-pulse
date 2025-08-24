-- Backfill timezone data for existing events - FIXED VERSION
-- This migration will populate the new timezone fields for events that only have the legacy date field

UPDATE events 
SET 
  event_start_utc = CASE 
    WHEN date IS NOT NULL THEN 
      -- Convert legacy UTC midnight dates to proper CDT/CST evening times
      CASE 
        -- If date is exactly at midnight UTC, convert to 7:30 PM CDT (00:30 UTC next day)
        WHEN EXTRACT(HOUR FROM date) = 0 AND EXTRACT(MINUTE FROM date) = 0 AND EXTRACT(SECOND FROM date) = 0 THEN
          date + INTERVAL '30 minutes'
        ELSE
          date
      END
    ELSE NULL
  END,
  event_start_local = CASE 
    WHEN date IS NOT NULL THEN 
      -- Convert to local Central Time representation as timestamp
      CASE 
        WHEN EXTRACT(HOUR FROM date) = 0 AND EXTRACT(MINUTE FROM date) = 0 AND EXTRACT(SECOND FROM date) = 0 THEN
          -- For midnight UTC events, show as 7:30 PM on the previous day in Central Time
          (date - INTERVAL '5 hours 30 minutes')::timestamp
        ELSE
          -- For other events, convert to Central Time
          (date - INTERVAL '5 hours')::timestamp
      END
    ELSE NULL
  END,
  event_timezone = CASE 
    WHEN date IS NOT NULL THEN 'America/Chicago'
    ELSE NULL
  END,
  updated_at = NOW()
WHERE 
  event_start_utc IS NULL 
  AND event_start_local IS NULL 
  AND event_timezone IS NULL 
  AND date IS NOT NULL;