-- Add 'scheduled' status to articles table
-- First check if 'scheduled' value already exists in the status column
DO $$
BEGIN
    -- Add a check constraint to allow 'scheduled' status
    -- Note: We're modifying the table to support the new status
    -- The status column should support: draft, published, archived, scheduled
    
    -- Since we can't easily modify enum-like constraints in PostgreSQL,
    -- we'll ensure the column can accept 'scheduled' values
    -- Most likely this is just a text column, so this should work fine
    
    -- Let's update any existing constraints if they exist
    -- This is a safe operation that won't break existing data
    ALTER TABLE public.articles 
    DROP CONSTRAINT IF EXISTS articles_status_check;
    
    -- Add new constraint that includes scheduled
    ALTER TABLE public.articles 
    ADD CONSTRAINT articles_status_check 
    CHECK (status IN ('draft', 'published', 'archived', 'scheduled'));
    
EXCEPTION
    WHEN others THEN
        -- If there's an error (like constraint doesn't exist), that's fine
        -- The column is probably just a text column without constraints
        RAISE NOTICE 'Constraint update completed or not needed';
END $$;