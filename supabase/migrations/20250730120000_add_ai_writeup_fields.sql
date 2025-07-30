-- Add AI-generated writeup fields for SEO/GEO optimization

-- Add ai_writeup field to events table
ALTER TABLE events 
ADD COLUMN ai_writeup TEXT,
ADD COLUMN writeup_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN writeup_prompt_used TEXT;

-- Add ai_writeup field to restaurants table  
ALTER TABLE restaurants
ADD COLUMN ai_writeup TEXT,
ADD COLUMN writeup_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN writeup_prompt_used TEXT;

-- Add indexes for performance
CREATE INDEX idx_events_ai_writeup ON events(ai_writeup) WHERE ai_writeup IS NOT NULL;
CREATE INDEX idx_restaurants_ai_writeup ON restaurants(ai_writeup) WHERE ai_writeup IS NOT NULL;

-- Add comments
COMMENT ON COLUMN events.ai_writeup IS 'AI-generated SEO/GEO optimized writeup about the event';
COMMENT ON COLUMN events.writeup_generated_at IS 'Timestamp when the AI writeup was generated';
COMMENT ON COLUMN events.writeup_prompt_used IS 'The AI prompt used to generate the writeup';

COMMENT ON COLUMN restaurants.ai_writeup IS 'AI-generated SEO/GEO optimized writeup about the restaurant';
COMMENT ON COLUMN restaurants.writeup_generated_at IS 'Timestamp when the AI writeup was generated';
COMMENT ON COLUMN restaurants.writeup_prompt_used IS 'The AI prompt used to generate the writeup';
