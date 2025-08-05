-- Add opening_timeframe column for approximate dates like "Summer 2025", "Fall 2024", etc.
-- This allows us to handle both exact dates and approximate timeframes

-- Add opening_timeframe column
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

-- Add index for searching by timeframe
CREATE INDEX IF NOT EXISTS idx_restaurants_opening_timeframe ON public.restaurants(opening_timeframe) WHERE opening_timeframe IS NOT NULL;

-- Examples of how this would work:
-- opening_date = '2025-08-15' AND opening_timeframe = NULL (exact date)
-- opening_date = NULL AND opening_timeframe = 'Summer 2025' (approximate)
-- opening_date = '2025-07-01' AND opening_timeframe = 'Summer 2025' (estimated date within timeframe)

-- Show the updated table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;
