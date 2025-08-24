-- 1. Add a city column to the events table if it doesn't exist
ALTER TABLE events ADD COLUMN IF NOT EXISTS city text;

-- 2. Extract city from standardized location field
UPDATE events
SET city = 
  CASE
    WHEN venue ILIKE '%Des Moines Water Works Park%' OR venue ILIKE '%Des Moines Biergarten%' OR venue ILIKE '%Lauridsen Amphitheater%' OR venue ILIKE '%Killinger Family Stage%' THEN 'Des Moines'
    WHEN location IS NOT NULL AND position(',' IN location) > 0
    THEN TRIM(SPLIT_PART(location, ',', ARRAY_LENGTH(STRING_TO_ARRAY(location, ','), 1) - 2))
    ELSE NULL
  END;
