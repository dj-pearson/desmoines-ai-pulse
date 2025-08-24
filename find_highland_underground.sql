-- Find Highland Underground in any table to see where it actually exists
-- Run this in Supabase SQL Editor

-- 1. Check if Highland Underground exists in restaurants table
SELECT 'restaurants' as table_name, id, name, status, opening_timeframe
FROM public.restaurants 
WHERE name ILIKE '%highland%underground%'

UNION ALL

-- 2. Check if it exists in restaurant_openings table
SELECT 'restaurant_openings' as table_name, id, name, status, opening_timeframe
FROM public.restaurant_openings 
WHERE name ILIKE '%highland%underground%'

ORDER BY table_name;

-- 3. Also check the exact ID that the form is trying to use
SELECT 'restaurants_by_id' as table_name, id, name, status, opening_timeframe
FROM public.restaurants 
WHERE id = 'f0cb9fbd-100e-4e45-8f23-f26fd09be59b'

UNION ALL

SELECT 'restaurant_openings_by_id' as table_name, id, name, status, opening_timeframe
FROM public.restaurant_openings 
WHERE id = 'f0cb9fbd-100e-4e45-8f23-f26fd09be59b';
