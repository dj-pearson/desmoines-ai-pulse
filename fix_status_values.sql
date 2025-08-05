-- Check for any restaurants with invalid status values
SELECT id, name, status 
FROM public.restaurants 
WHERE status NOT IN ('open', 'opening_soon', 'newly_opened', 'announced', 'closed') 
   OR status IS NULL;

-- Fix any invalid status values
UPDATE public.restaurants 
SET status = 'open' 
WHERE status NOT IN ('open', 'opening_soon', 'newly_opened', 'announced', 'closed') 
   OR status IS NULL;

-- Verify all status values are now valid
SELECT DISTINCT status, COUNT(*) as count
FROM public.restaurants 
GROUP BY status
ORDER BY status;
