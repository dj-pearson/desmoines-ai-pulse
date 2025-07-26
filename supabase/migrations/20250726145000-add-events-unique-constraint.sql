-- Add unique constraint for events to support ON CONFLICT in upsert operations
-- This allows the scrape-events function to use upsert with ON CONFLICT

-- First, remove any potential duplicates if they exist
DELETE FROM public.events e1 
WHERE EXISTS (
  SELECT 1 FROM public.events e2 
  WHERE e2.title = e1.title 
    AND e2.date::date = e1.date::date 
    AND e2.id > e1.id
);

-- Add unique constraint on title and date (date truncated to day level)
-- We use a partial index to handle the constraint properly
CREATE UNIQUE INDEX events_title_date_unique_idx 
ON public.events (title, date::date);

-- Add a composite unique constraint that the upsert can use
ALTER TABLE public.events 
ADD CONSTRAINT events_title_date_unique 
UNIQUE USING INDEX events_title_date_unique_idx;

-- Update the events table to allow write access for authenticated users (for edge functions)
CREATE POLICY "Allow insert/update for authenticated users" ON public.events 
FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role'); 