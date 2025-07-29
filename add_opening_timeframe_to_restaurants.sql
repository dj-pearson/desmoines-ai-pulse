-- Add opening_timeframe to restaurants table for flexible date handling
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN public.restaurants.opening_timeframe IS 'Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")';

-- Also ensure the restaurant_openings table has this field
ALTER TABLE public.restaurant_openings 
ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

-- Add comment to restaurant_openings as well
COMMENT ON COLUMN public.restaurant_openings.opening_timeframe IS 'Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")';

-- Show updated restaurant table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;
