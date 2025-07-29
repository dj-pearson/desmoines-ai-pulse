-- Test query to verify Highland Underground exists and can be updated
-- Run this in Supabase SQL Editor to test

-- 1. Find Highland Underground
SELECT id, name, status, opening_timeframe, website, description
FROM public.restaurants 
WHERE name ILIKE '%highland%underground%'
LIMIT 1;

-- 2. Try a manual update (replace the ID with the actual ID from step 1)
-- UPDATE public.restaurants 
-- SET status = 'opening_soon', opening_timeframe = 'Summer 2025'
-- WHERE name ILIKE '%highland%underground%';

-- 3. Verify the update worked
-- SELECT id, name, status, opening_timeframe, website, description
-- FROM public.restaurants 
-- WHERE name ILIKE '%highland%underground%';

-- 4. Check if all required columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
AND column_name IN ('status', 'opening_timeframe', 'opening_date', 'website')
ORDER BY column_name;
