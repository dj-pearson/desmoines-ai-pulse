-- Add unique constraint for events to support ON CONFLICT in upsert operations
-- This allows the scrape-events function to use upsert with ON CONFLICT

-- First, remove any potential duplicates if they exist
-- We'll check for duplicates based on title and same day
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY title, date::date ORDER BY created_at) as rn
  FROM public.events
)
DELETE FROM public.events 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint on title and venue (simpler approach)
-- Since we can't easily do date casting in constraints, we'll use title + venue
-- which should be unique enough for our use case
ALTER TABLE public.events 
ADD CONSTRAINT events_title_venue_unique 
UNIQUE (title, venue);

-- Update the events table to allow write access for authenticated users (for edge functions)
CREATE POLICY "Allow insert/update for authenticated users" ON public.events 
FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role'); 