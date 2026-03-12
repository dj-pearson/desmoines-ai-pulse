-- US-045: Venues table for live music hub
CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  address TEXT,
  capacity INTEGER,
  venue_type TEXT CHECK (venue_type IN ('arena', 'theater', 'bar', 'club', 'outdoor', 'civic')),
  image_url TEXT,
  website TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read access" ON public.venues FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin insert" ON public.venues FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin update" ON public.venues FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_venues_slug ON public.venues(slug);
CREATE INDEX idx_venues_type ON public.venues(venue_type);

-- Seed major Des Moines music venues
INSERT INTO public.venues (name, slug, description, address, capacity, venue_type, latitude, longitude) VALUES
('Wells Fargo Arena', 'wells-fargo-arena', 'The premier large-scale concert and event venue in Des Moines, hosting major touring acts, Iowa Wild hockey, and Iowa Wolves basketball.', '730 3rd St, Des Moines, IA 50309', 16980, 'arena', 41.5908, -93.6208),
('Hoyt Sherman Place', 'hoyt-sherman-place', 'A beautiful historic theater built in 1877, hosting intimate concerts, comedy, and performing arts in a stunning gilded-age setting.', '1501 Woodland Ave, Des Moines, IA 50309', 1265, 'theater', 41.5832, -93.6467),
('Woolys', 'woolys', 'Des Moines'' most popular mid-size indie music venue in the East Village, known for its intimate atmosphere and eclectic bookings.', '504 E Locust St, Des Moines, IA 50309', 700, 'club', 41.5892, -93.6098),
('xBk', 'xbk', 'A versatile community-centered venue combining live music, art exhibitions, and coworking space in the Historic East Village.', '1159 24th St, Des Moines, IA 50311', 300, 'club', 41.5877, -93.6555),
('Leftys Live Music', 'leftys-live-music', 'A laid-back live music venue offering local and touring bands across rock, blues, country, and more in a classic bar setting.', '2307 University Ave, Des Moines, IA 50311', 250, 'bar', 41.5932, -93.6613),
('Val Air Ballroom', 'val-air-ballroom', 'A historic 1930s ballroom in West Des Moines hosting concerts, comedy shows, and special events with retro charm.', '301 Ashworth Rd, West Des Moines, IA 50265', 2000, 'theater', 41.5724, -93.7288),
('Des Moines Civic Center', 'des-moines-civic-center', 'The anchor performing arts venue downtown, presenting Broadway tours, concerts, ballet, and the Des Moines Symphony.', '221 Walnut St, Des Moines, IA 50309', 2735, 'civic', 41.5851, -93.6271),
('Simon Estes Amphitheater', 'simon-estes-amphitheater', 'A beautiful outdoor amphitheater along the Des Moines River, hosting summer concerts, festivals, and community events.', '75 E Locust St, Des Moines, IA 50309', 2500, 'outdoor', 41.5865, -93.6230),
('Vibrant Music Hall', 'vibrant-music-hall', 'A newer mid-size concert hall in Waukee offering a modern concert experience for touring and regional acts.', '1680 SE Dahlia Dr, Waukee, IA 50263', 1500, 'theater', 41.5780, -93.8620);
