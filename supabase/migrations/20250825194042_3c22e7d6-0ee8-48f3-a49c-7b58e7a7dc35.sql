-- Add unique constraint to competitors website_url
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitors') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitors_website_url_unique') THEN
      ALTER TABLE competitors ADD CONSTRAINT competitors_website_url_unique UNIQUE (website_url);
    END IF;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, skip
WHEN unique_violation THEN
  -- Duplicate values exist, cannot add constraint
END $$;

-- Add unique constraint to competitor_content for upsert operations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitor_content') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitor_content_competitor_id_url_unique') THEN
      ALTER TABLE competitor_content ADD CONSTRAINT competitor_content_competitor_id_url_unique UNIQUE (competitor_id, url);
    END IF;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, skip
WHEN unique_violation THEN
  -- Duplicate values exist, cannot add constraint
END $$;

-- Add a test competitor
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competitors') THEN
    IF NOT EXISTS (SELECT 1 FROM competitors WHERE website_url = 'https://www.catchdesmoines.com/') THEN
      INSERT INTO competitors (name, website_url, description, primary_focus) 
      VALUES ('Catch Des Moines', 'https://www.catchdesmoines.com/', 'Des Moines tourism and events website', 'Tourism and Events');
    END IF;
  END IF;
END $$;