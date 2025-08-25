-- Fix the competitor_content table to have proper unique constraint for upsert
ALTER TABLE competitor_content ADD CONSTRAINT competitor_content_competitor_id_url_unique UNIQUE (competitor_id, url);

-- Add a test competitor if none exists
INSERT INTO competitors (name, website_url, description, primary_focus) 
VALUES ('Catch Des Moines', 'https://www.catchdesmoines.com/', 'Des Moines tourism and events website', 'Tourism and Events')
ON CONFLICT (website_url) DO NOTHING;