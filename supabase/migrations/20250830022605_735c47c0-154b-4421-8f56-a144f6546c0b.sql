-- Fix timezone issues for recent September 13th events
-- These events are being stored as UTC midnight (Sept 13 00:00:00Z) but should be Sept 12 7PM CDT

-- Update events created in the last 2 hours that have midnight UTC dates
UPDATE events 
SET 
  date = date - INTERVAL '5 hours',  -- Convert UTC midnight to CDT 7PM (previous day)
  updated_at = NOW()
WHERE 
  created_at > NOW() - INTERVAL '2 hours'
  AND EXTRACT(HOUR FROM date) = 0 
  AND EXTRACT(MINUTE FROM date) = 0 
  AND EXTRACT(SECOND FROM date) = 0;

-- Also fix the event_start_utc field if it exists and has the same issue
UPDATE events 
SET 
  event_start_utc = event_start_utc - INTERVAL '5 hours',
  updated_at = NOW()
WHERE 
  created_at > NOW() - INTERVAL '2 hours'
  AND event_start_utc IS NOT NULL
  AND EXTRACT(HOUR FROM event_start_utc) = 0 
  AND EXTRACT(MINUTE FROM event_start_utc) = 0 
  AND EXTRACT(SECOND FROM event_start_utc) = 0;