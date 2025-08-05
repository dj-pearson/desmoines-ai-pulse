-- This script will update the location field in the events table using Google Places API results
-- and then re-extract the city from the standardized address.
-- You will need to run your batch address lookup separately and then run this script.

-- 1. Update location field with standardized address (run this after your batch lookup)
-- Example:
-- UPDATE events SET location = '<standardized address>' WHERE venue = '<venue name>';

-- 2. Re-extract city from the updated location field
UPDATE events
SET city = 
  CASE
    WHEN location IS NOT NULL AND position(',' IN location) > 0
    THEN trim(split_part(location, ',', 2))
    ELSE NULL
  END
WHERE location IS NOT NULL;
