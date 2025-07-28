-- Complete migration to add missing fields to restaurants table

-- Add opening_date column
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS opening_date DATE;

-- Add status column with check constraint
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('open', 'opening_soon', 'newly_opened', 'announced', 'closed')) DEFAULT 'open';

-- Add opening_timeframe column for approximate dates
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

-- Add comments to explain the fields
COMMENT ON COLUMN public.restaurants.opening_date IS 'Exact opening date for restaurants that are not yet open';
COMMENT ON COLUMN public.restaurants.status IS 'Current status of the restaurant';
COMMENT ON COLUMN public.restaurants.opening_timeframe IS 'Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_restaurants_opening_date ON public.restaurants(opening_date) WHERE opening_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON public.restaurants(status);

-- Verify the complete table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;
