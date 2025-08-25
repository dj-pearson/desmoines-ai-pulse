-- Add unique constraint to competitors website_url
ALTER TABLE competitors ADD CONSTRAINT competitors_website_url_unique UNIQUE (website_url);

-- Add unique constraint to competitor_content for upsert operations
ALTER TABLE competitor_content ADD CONSTRAINT competitor_content_competitor_id_url_unique UNIQUE (competitor_id, url);

-- Add a test competitor
INSERT INTO competitors (name, website_url, description, primary_focus) 
VALUES ('Catch Des Moines', 'https://www.catchdesmoines.com/', 'Des Moines tourism and events website', 'Tourism and Events')
ON CONFLICT (website_url) DO NOTHING;