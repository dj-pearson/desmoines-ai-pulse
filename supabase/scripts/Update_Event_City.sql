-- 1. Add a city column to the events table if it doesn't exist
ALTER TABLE events ADD COLUMN IF NOT EXISTS city text;

-- 2. Extract city from standardized location field
UPDATE events
SET city = 
  CASE
    WHEN location IS NOT NULL AND position(',' IN location) > 0
    THEN trim(split_part(location, ',', 2))
    ELSE NULL
  END
WHERE city IS NULL OR city ~ 'IA|[0-9]{5}';
