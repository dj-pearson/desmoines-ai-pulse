-- SQL commands to run in Supabase SQL Editor
-- Add opening_date and status columns to restaurants table

-- Add opening_date column
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS opening_date DATE;

-- Add status column
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('open', 'opening_soon', 'newly_opened', 'announced', 'closed')) DEFAULT 'open';

-- Add source_url column for consistency
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_restaurants_opening_date ON public.restaurants(opening_date) WHERE opening_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON public.restaurants(status);

-- Show the updated table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;
