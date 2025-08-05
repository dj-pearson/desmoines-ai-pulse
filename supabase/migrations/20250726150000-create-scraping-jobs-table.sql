-- Create scraping_jobs table for storing scraper configurations
CREATE TABLE IF NOT EXISTS public.scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT CHECK (status IN ('idle', 'running', 'completed', 'failed')) DEFAULT 'idle',
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  events_found INTEGER DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on scraping_jobs table
ALTER TABLE public.scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for scraping_jobs (admin access only)
CREATE POLICY "Admin read access for scraping_jobs" ON public.scraping_jobs 
FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Admin write access for scraping_jobs" ON public.scraping_jobs 
FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create updated_at trigger for scraping_jobs
CREATE TRIGGER update_scraping_jobs_updated_at 
BEFORE UPDATE ON public.scraping_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_scraping_jobs_status ON public.scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_next_run ON public.scraping_jobs(next_run);

-- Insert the real Des Moines area scraper configurations
INSERT INTO public.scraping_jobs (name, status, last_run, next_run, events_found, config) VALUES
(
  'Catch Des Moines Events',
  'idle',
  now() - interval '3 hours',
  now() + interval '3 hours',
  0,
  '{
    "url": "https://www.catchdesmoines.com/events/",
    "schedule": "0 */6 * * *",
    "selectors": {
      "title": ".event-title, h2.title, h3.title",
      "description": ".event-description, .description, .summary",
      "date": ".event-date, .date, time[datetime]",
      "location": ".event-location, .location, .venue",
      "price": ".event-price, .price, .cost",
      "category": ".event-category, .category, .event-type"
    },
    "isActive": true
  }'::jsonb
),
(
  'Iowa Cubs Schedule',
  'idle',
  now() - interval '1 hour',
  now() + interval '11 hours',
  0,
  '{
    "url": "https://www.milb.com/iowa/schedule",
    "schedule": "0 */12 * * *",
    "selectors": {
      "title": ".game-matchup, .opponent, .game-title",
      "description": ".game-info, .promotion-info, .special-event",
      "date": ".game-date, .date, .schedule-date, [data-date]",
      "location": ".venue, .location, .park-name",
      "price": ".ticket-price, .price, .buy-tickets",
      "category": ".game-type, .promotion-type"
    },
    "isActive": true
  }'::jsonb
),
(
  'Iowa Wolves G-League',
  'idle',
  now() - interval '2 hours',
  now() + interval '10 hours',
  0,
  '{
    "url": "https://iowa.gleague.nba.com/schedule",
    "schedule": "0 */12 * * *",
    "selectors": {
      "title": ".game-matchup, .opponent, .vs, .game-info",
      "description": ".game-details, .special-event, .promotion",
      "date": ".game-date, .date, .schedule-date, time",
      "location": ".venue, .arena, .location",
      "price": ".ticket-info, .price, .tickets",
      "category": ".game-type, .season-type"
    },
    "isActive": true
  }'::jsonb
),
(
  'Iowa Wild Hockey',
  'idle',
  now() - interval '4 hours',
  now() + interval '8 hours',
  0,
  '{
    "url": "https://www.iowawild.com/games",
    "schedule": "0 */12 * * *",
    "selectors": {
      "title": ".game-matchup, .opponent, .vs-opponent",
      "description": ".game-info, .promotion, .special-event",
      "date": ".game-date, .date, .game-time",
      "location": ".venue, .arena, .rink",
      "price": ".ticket-price, .pricing, .tickets",
      "category": ".game-type, .promotion-type"
    },
    "isActive": true
  }'::jsonb
),
(
  'Iowa Barnstormers Arena Football',
  'idle',
  now() - interval '5 hours',
  now() + interval '7 hours',
  0,
  '{
    "url": "https://theiowabarnstormers.com/",
    "schedule": "0 0 */2 * *",
    "selectors": {
      "title": ".game-title, .matchup, .opponent",
      "description": ".game-details, .event-info, .description",
      "date": ".game-date, .date, .schedule-date",
      "location": ".venue, .stadium, .arena",
      "price": ".ticket-info, .pricing, .tickets",
      "category": ".game-type, .event-type"
    },
    "isActive": true
  }'::jsonb
),
(
  'Iowa Events Center',
  'idle',
  now() - interval '2 hours',
  now() + interval '4 hours',
  0,
  '{
    "url": "https://www.iowaeventscenter.com/",
    "schedule": "0 */8 * * *",
    "selectors": {
      "title": ".event-title, .show-title, h2, h3",
      "description": ".event-description, .show-description, .summary",
      "date": ".event-date, .show-date, .date, time",
      "location": ".venue, .location, .hall",
      "price": ".ticket-price, .pricing, .cost",
      "category": ".event-type, .show-type, .category"
    },
    "isActive": true
  }'::jsonb
),
(
  'Vibrant Music Hall',
  'idle',
  now() - interval '1 hour',
  now() + interval '5 hours',
  0,
  '{
    "url": "https://www.vibrantmusichall.com/",
    "schedule": "0 */6 * * *",
    "selectors": {
      "title": ".show-title, .artist-name, .event-title, h1, h2",
      "description": ".show-description, .event-details, .artist-bio",
      "date": ".show-date, .event-date, .date, time",
      "location": ".venue, .hall, .room",
      "price": ".ticket-price, .pricing, .cost, .price-range",
      "category": ".genre, .show-type, .music-type"
    },
    "isActive": true
  }'::jsonb
),
(
  'Google Events - Des Moines',
  'idle',
  now() - interval '6 hours',
  now() + interval '2 hours',
  0,
  '{
    "url": "https://www.google.com/search?q=events+in+des+moines+iowa",
    "schedule": "0 */4 * * *",
    "selectors": {
      "title": ".event-title, .g-card h3, .event-name",
      "description": ".event-description, .snippet, .event-details",
      "date": ".event-date, .date, .when",
      "location": ".event-location, .location, .where",
      "price": ".price, .cost, .ticket-info",
      "category": ".event-type, .category"
    },
    "isActive": true
  }'::jsonb
); 