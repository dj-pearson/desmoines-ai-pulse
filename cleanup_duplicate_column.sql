-- Cleanup script to remove duplicate opening column
-- Since we're using opening_date, we can remove the opening column

-- First, check if there's any data in the opening column that we need to migrate
SELECT id, name, opening, opening_date 
FROM public.restaurants 
WHERE opening IS NOT NULL OR opening_date IS NOT NULL;

-- If opening has data but opening_date doesn't, uncomment and run this:
-- UPDATE public.restaurants 
-- SET opening_date = opening 
-- WHERE opening IS NOT NULL AND opening_date IS NULL;

-- Remove the duplicate opening column
ALTER TABLE public.restaurants 
DROP COLUMN IF EXISTS opening;

-- Verify the final table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
AND table_schema = 'public'
ORDER BY ordinal_position;
