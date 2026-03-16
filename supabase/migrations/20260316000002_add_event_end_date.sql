-- Add end_date column to events table for Schema.org endDate field.
-- GSC reports "Missing field endDate" on 48 event items.
-- When NULL, the frontend estimates endDate as startDate + 3 hours for schema output.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

COMMENT ON COLUMN public.events.end_date IS
  'The end date/time of the event. Used in Schema.org Event markup for Google Events rich results.';

-- Index for queries that filter by end_date (e.g. "events happening now")
CREATE INDEX IF NOT EXISTS idx_events_end_date ON public.events (end_date)
WHERE end_date IS NOT NULL;
