-- Fix the competitor_content table to have proper unique constraint for upsert
DO $$ BEGIN
  -- Only add constraint if competitor_content table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitor_content') THEN
    ALTER TABLE competitor_content ADD CONSTRAINT competitor_content_competitor_id_url_unique UNIQUE (competitor_id, url);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, skip
WHEN unique_violation THEN
  -- Duplicate values exist, cannot add constraint
END $$;

-- Add unique constraint on website_url for competitors table
DO $$ BEGIN
  -- Only add constraint if competitors table exists  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitors') THEN
    ALTER TABLE competitors ADD CONSTRAINT competitors_website_url_unique UNIQUE (website_url);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, skip
WHEN unique_violation THEN
  -- Duplicate values exist, cannot add constraint
END $$;

-- Add a test competitor if none exists (only if table exists and entry doesn't exist)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitors') THEN
    IF NOT EXISTS (SELECT 1 FROM competitors WHERE website_url = 'https://www.catchdesmoines.com/') THEN
      INSERT INTO competitors (name, website_url, description, primary_focus) 
      VALUES ('Catch Des Moines', 'https://www.catchdesmoines.com/', 'Des Moines tourism and events website', 'Tourism and Events');
    END IF;
  END IF;
END $$;