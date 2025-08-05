-- Manual migration script - Run this in Supabase SQL Editor
-- Add AI-generated writeup fields for SEO/GEO optimization

-- Add ai_writeup field to events table (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ai_writeup') THEN
        ALTER TABLE events ADD COLUMN ai_writeup TEXT;
        ALTER TABLE events ADD COLUMN writeup_generated_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE events ADD COLUMN writeup_prompt_used TEXT;
        
        -- Add indexes for performance
        CREATE INDEX IF NOT EXISTS idx_events_ai_writeup ON events(ai_writeup) WHERE ai_writeup IS NOT NULL;
        
        -- Add comments
        COMMENT ON COLUMN events.ai_writeup IS 'AI-generated SEO/GEO optimized writeup about the event';
        COMMENT ON COLUMN events.writeup_generated_at IS 'Timestamp when the AI writeup was generated';
        COMMENT ON COLUMN events.writeup_prompt_used IS 'The AI prompt used to generate the writeup';
    END IF;
END $$;

-- Add ai_writeup field to restaurants table (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'ai_writeup') THEN
        ALTER TABLE restaurants ADD COLUMN ai_writeup TEXT;
        ALTER TABLE restaurants ADD COLUMN writeup_generated_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE restaurants ADD COLUMN writeup_prompt_used TEXT;
        
        -- Add indexes for performance
        CREATE INDEX IF NOT EXISTS idx_restaurants_ai_writeup ON restaurants(ai_writeup) WHERE ai_writeup IS NOT NULL;
        
        -- Add comments
        COMMENT ON COLUMN restaurants.ai_writeup IS 'AI-generated SEO/GEO optimized writeup about the restaurant';
        COMMENT ON COLUMN restaurants.writeup_generated_at IS 'Timestamp when the AI writeup was generated';
        COMMENT ON COLUMN restaurants.writeup_prompt_used IS 'The AI prompt used to generate the writeup';
    END IF;
END $$;
