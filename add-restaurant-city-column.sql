-- Add city column to restaurants table for better filtering
-- This will extract city names from the full location addresses

-- First, add the city column
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS city TEXT;

-- Create an index for better performance on city filtering
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON public.restaurants(city);

-- Now let's analyze current location data to understand the patterns
SELECT 'CURRENT LOCATION PATTERNS:' as analysis;
SELECT 
  location,
  COUNT(*) as count
FROM public.restaurants 
WHERE location IS NOT NULL
GROUP BY location
ORDER BY count DESC
LIMIT 20;

-- Extract city from location using various patterns
UPDATE public.restaurants 
SET city = CASE
  -- Pattern: "City, State" or "City, State Zip"
  WHEN location ~ '^[^,]+, [A-Z]{2}' THEN 
    TRIM(SPLIT_PART(location, ',', 1))
  
  -- Pattern: "Address, City, State"  
  WHEN location ~ ',.*,.*[A-Z]{2}' THEN
    TRIM(SPLIT_PART(SPLIT_PART(location, ',', -2), ',', 1))
  
  -- Pattern: Just "City State" (no commas)
  WHEN location ~ '^[A-Za-z\s]+ [A-Z]{2}$' THEN
    TRIM(REGEXP_REPLACE(location, ' [A-Z]{2}.*$', ''))
  
  -- Pattern: "Address in City" - try to extract city portion
  WHEN location ILIKE '%Des Moines%' THEN 'Des Moines'
  WHEN location ILIKE '%West Des Moines%' THEN 'West Des Moines'
  WHEN location ILIKE '%Ankeny%' THEN 'Ankeny'
  WHEN location ILIKE '%Urbandale%' THEN 'Urbandale'
  WHEN location ILIKE '%Johnston%' THEN 'Johnston'
  WHEN location ILIKE '%Clive%' THEN 'Clive'
  WHEN location ILIKE '%Waukee%' THEN 'Waukee'
  WHEN location ILIKE '%Altoona%' THEN 'Altoona'
  WHEN location ILIKE '%Ames%' THEN 'Ames'
  WHEN location ILIKE '%Norwalk%' THEN 'Norwalk'
  WHEN location ILIKE '%Bondurant%' THEN 'Bondurant'
  WHEN location ILIKE '%Windsor Heights%' THEN 'Windsor Heights'
  WHEN location ILIKE '%Pleasant Hill%' THEN 'Pleasant Hill'
  
  -- Default: try first part before comma
  WHEN location ~ ',' THEN 
    TRIM(SPLIT_PART(location, ',', 1))
  
  -- Fallback: use full location if no pattern matches
  ELSE TRIM(location)
END
WHERE location IS NOT NULL;

-- Clean up city names - remove any remaining state/zip info
UPDATE public.restaurants 
SET city = TRIM(REGEXP_REPLACE(city, ' [A-Z]{2}.*$', ''))
WHERE city ~ ' [A-Z]{2}';

-- Show results of city extraction
SELECT 'EXTRACTED CITIES:' as results;
SELECT 
  city,
  COUNT(*) as restaurant_count,
  STRING_AGG(DISTINCT SUBSTRING(location, 1, 50), '; ') as sample_locations
FROM public.restaurants 
WHERE city IS NOT NULL
GROUP BY city
ORDER BY restaurant_count DESC;

-- Verify extraction quality
SELECT 'CITY EXTRACTION VERIFICATION:' as verification;
SELECT 
  location,
  city,
  CASE 
    WHEN city IS NULL THEN '❌ No city extracted'
    WHEN LENGTH(city) > 30 THEN '⚠️ City name too long'
    WHEN city ~ '\d' THEN '⚠️ Contains numbers'
    ELSE '✅ Looks good'
  END as quality_check
FROM public.restaurants 
WHERE location IS NOT NULL
ORDER BY 
  CASE 
    WHEN city IS NULL THEN 1
    WHEN LENGTH(city) > 30 THEN 2
    WHEN city ~ '\d' THEN 3
    ELSE 4
  END,
  city;

-- Show city counts for Des Moines metro area
SELECT 'DES MOINES METRO CITIES:' as metro_cities;
SELECT 
  city,
  COUNT(*) as restaurants
FROM public.restaurants 
WHERE city IN (
  'Des Moines', 'West Des Moines', 'Ankeny', 'Urbandale', 
  'Johnston', 'Clive', 'Waukee', 'Altoona', 'Ames',
  'Norwalk', 'Bondurant', 'Windsor Heights', 'Pleasant Hill'
)
GROUP BY city
ORDER BY restaurants DESC;
