-- Add AI writeup fields to events table for bulk SEO enhancement
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS ai_writeup TEXT,
ADD COLUMN IF NOT EXISTS writeup_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS writeup_prompt_used TEXT;

-- Create index for performance on AI writeup queries
CREATE INDEX IF NOT EXISTS idx_events_ai_writeup ON public.events(ai_writeup);

-- Add comments for clarity
COMMENT ON COLUMN public.events.ai_writeup IS 'AI-generated local SEO and GEO optimized writeup for the event';
COMMENT ON COLUMN public.events.writeup_generated_at IS 'Timestamp when the AI writeup was generated';
COMMENT ON COLUMN public.events.writeup_prompt_used IS 'Prompt used to generate the writeup for debugging purposes';