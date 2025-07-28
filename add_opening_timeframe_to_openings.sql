-- Add opening_timeframe to restaurants table (this is what the admin form edits)
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN public.restaurants.opening_timeframe IS 'Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")';

-- Also add to restaurant_openings table for consistency
ALTER TABLE public.restaurant_openings 
ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

-- Add comment to restaurant_openings as well
COMMENT ON COLUMN public.restaurant_openings.opening_timeframe IS 'Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")';

-- Verify the columns were added
SELECT 'restaurants' as table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
AND column_name = 'opening_timeframe'
UNION ALL
SELECT 'restaurant_openings' as table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'restaurant_openings' 
AND table_schema = 'public'
AND column_name = 'opening_timeframe';
