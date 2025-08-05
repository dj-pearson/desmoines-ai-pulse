-- Add opening date column to restaurants table
-- This will be used to track restaurant openings. If the opening date is in the future,
-- the restaurant will appear in the "Restaurant Openings" section.

ALTER TABLE public.restaurants 
ADD COLUMN opening_date DATE;

-- Add index for efficient querying of upcoming restaurant openings
CREATE INDEX idx_restaurants_opening_date ON public.restaurants(opening_date) WHERE opening_date IS NOT NULL;

-- Add status column to track opening status
ALTER TABLE public.restaurants 
ADD COLUMN status TEXT CHECK (status IN ('open', 'opening_soon', 'newly_opened', 'announced', 'closed')) DEFAULT 'open';

-- Add index for status
CREATE INDEX idx_restaurants_status ON public.restaurants(status);
